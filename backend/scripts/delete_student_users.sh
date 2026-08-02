#!/usr/bin/env bash
#
# Wrapper for delete_student_users.sql — runs ONE section at a time against the
# database in backend/.env.
#
#   ./scripts/delete_student_users.sh preflight   read-only: FK audit
#   ./scripts/delete_student_users.sh preview     read-only: row counts + account list
#   ./scripts/delete_student_users.sh dry-run     hard delete, rolled back
#   ./scripts/delete_student_users.sh soft        set deleted_at (reversible)
#   ./scripts/delete_student_users.sh hard        permanent delete (backs up first)
#
# Options:
#   --yes           skip the confirmation prompt (for soft/hard)
#   --no-backup     skip the pg_dump before `hard` (not advised)
#   --database NAME override the database name
#
set -euo pipefail

BACKEND_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SQL_FILE="$BACKEND_DIR/scripts/delete_student_users.sql"
BACKUP_DIR="${BACKUP_DIR:-$BACKEND_DIR/backups}"

ASSUME_YES=0
DO_BACKUP=1
DB_OVERRIDE=""
ACTION=""

die() { printf '\033[31merror:\033[0m %s\n' "$*" >&2; exit 1; }
info() { printf '\033[36m==>\033[0m %s\n' "$*"; }
warn() { printf '\033[33mwarn:\033[0m %s\n' "$*" >&2; }

while [ $# -gt 0 ]; do
    case "$1" in
        preflight|preview|dry-run|soft|hard) ACTION="$1" ;;
        --yes|-y)     ASSUME_YES=1 ;;
        --no-backup)  DO_BACKUP=0 ;;
        --database)   DB_OVERRIDE="${2:-}"; shift ;;
        -h|--help)    awk 'NR>2 && /^#/ { print substr($0, 3); next } NR>2 { exit }' "${BASH_SOURCE[0]}"; exit 0 ;;
        *)            die "unknown argument: $1 (try --help)" ;;
    esac
    shift
done

[ -n "$ACTION" ] || die "pick one: preflight | preview | dry-run | soft | hard"
[ -f "$SQL_FILE" ] || die "missing $SQL_FILE"
command -v psql >/dev/null || die "psql not found on PATH"

# ---------------------------------------------------------------------------
# Connection. Precedence: real environment > .env > built-in fallback, so you can
# aim this at another database for a rehearsal without editing .env:
#   DATABASE_URL=postgresql://…/scratch ./scripts/delete_student_users.sh preview
# Within that, DATABASE_URL wins over the DB_* vars — it is what the app itself
# reads (app/config.py), and in this project the two have disagreed.
# ---------------------------------------------------------------------------
if [ -f "$BACKEND_DIR/.env" ]; then
    while IFS= read -r line || [ -n "$line" ]; do
        case "$line" in ''|'#'*) continue ;; *=*) ;; *) continue ;; esac
        key="${line%%=*}"
        val="${line#*=}"
        key="${key#"${key%%[![:space:]]*}"}"     # ltrim
        key="${key%"${key##*[![:space:]]}"}"     # rtrim
        case "$key" in ''|*[!A-Za-z0-9_]*) continue ;; esac
        val="${val%$'\r'}"                       # tolerate CRLF
        case "$val" in
            \"*\") val="${val#\"}"; val="${val%\"}" ;;
            \'*\') val="${val#\'}"; val="${val%\'}" ;;
        esac
        # Only set what the caller has not already provided.
        if [ -z "${!key:-}" ]; then export "$key=$val"; fi
    done < "$BACKEND_DIR/.env"
else
    warn "no $BACKEND_DIR/.env — using the environment and built-in defaults"
fi

# Fallbacks only. No password default on purpose: an empty PGPASSWORD is not
# exported, so psql falls back to ~/.pgpass or prompts.
DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5432}"
DB_USER="${DB_USER:-lad}"
DB_PASSWORD="${DB_PASSWORD:-}"
DB_NAME="${DB_NAME:-larim_master}"

if [ -n "${DATABASE_URL:-}" ]; then
    # postgresql+psycopg://user:pass@host[:port]/dbname  ->  strip the +driver,
    # then let the URL supply whatever parts it actually specifies.
    url="${DATABASE_URL#*://}"

    case "$url" in
        *@*)
            creds="${url%%@*}"
            hostpart="${url#*@}"
            case "$creds" in
                *:*) DB_USER="${creds%%:*}"; DB_PASSWORD="${creds#*:}" ;;
                *)   [ -n "$creds" ] && DB_USER="$creds" ;;
            esac
            ;;
        *)  hostpart="$url" ;;
    esac

    case "$hostpart" in
        */*) url_host="${hostpart%%/*}"; url_db="${hostpart#*/}" ;;
        *)   url_host="$hostpart";       url_db="" ;;
    esac
    url_db="${url_db%%\?*}"

    case "$url_host" in
        "")  ;;
        *:*) DB_HOST="${url_host%%:*}"; DB_PORT="${url_host##*:}" ;;
        *)   DB_HOST="$url_host" ;;
    esac
    if [ -n "$url_db" ] && [ "$url_db" != "${DB_NAME}" ]; then
        warn "DATABASE_URL names '$url_db' but DB_NAME says '${DB_NAME}'. Using '$url_db' (the app does too)."
        DB_NAME="$url_db"
    fi
fi

[ -n "$DB_OVERRIDE" ] && DB_NAME="$DB_OVERRIDE"

export PGHOST="$DB_HOST" PGPORT="$DB_PORT" PGUSER="$DB_USER" PGDATABASE="$DB_NAME"
[ -n "$DB_PASSWORD" ] && export PGPASSWORD="$DB_PASSWORD"

psql -qtAc 'SELECT 1' >/dev/null 2>&1 || die \
    "cannot connect to $DB_USER@$DB_HOST:$DB_PORT/$DB_NAME — is the cluster running? (sudo pg_ctlcluster 17 main start)"

info "connected: $DB_USER@$DB_HOST:$DB_PORT/$DB_NAME"

# ---------------------------------------------------------------------------
# Slice the SQL file by its `-- @@SECTION <name>` markers.
# ---------------------------------------------------------------------------
section() {
    awk -v want="$1" '
        /^-- @@SECTION /  { on = ($3 == want); next }
        on                { print }
    ' "$SQL_FILE"
}

require_section() {
    local body
    body="$(section "$1")"
    [ -n "${body//[[:space:]]/}" ] || die "section '$1' not found in $SQL_FILE (were the @@SECTION markers removed?)"
    printf '%s\n' "$body"
}

confirm() {
    [ "$ASSUME_YES" -eq 1 ] && return 0
    local count
    count="$(psql -qtAc "
        SELECT count(*) FROM users u
        JOIN roles_permissions r ON r.id = u.role_id
        WHERE lower(r.role_name) = 'student';" | tr -d '[:space:]')"
    printf '\n\033[33m%s will affect %s student account(s) in %s.\033[0m\n' "$ACTION" "$count" "$DB_NAME"
    [ "$ACTION" = "hard" ] && printf '\033[31mThis is permanent.\033[0m\n'
    printf "Type the database name ('%s') to proceed: " "$DB_NAME"
    local reply; read -r reply
    [ "$reply" = "$DB_NAME" ] || die "aborted"
}

backup() {
    command -v pg_dump >/dev/null || die "pg_dump not found; re-run with --no-backup if you accept that"
    mkdir -p "$BACKUP_DIR"
    local out="$BACKUP_DIR/${DB_NAME}_$(date +%Y%m%d_%H%M%S).dump"
    info "backing up to $out"
    pg_dump -Fc > "$out"
    info "backup complete ($(du -h "$out" | cut -f1)) — restore with: pg_restore -d $DB_NAME -c '$out'"
}

# ON_ERROR_STOP matters most for `hard`: without it psql would sail past a
# failed DELETE and still reach the COMMIT. The per-table NOTICE trail shows how
# far a failed run got, so the statement echo would only add noise.
run_sql() { psql -v ON_ERROR_STOP=1; }

case "$ACTION" in
    preflight)
        info "read-only: foreign keys referencing students/users"
        require_section preflight | run_sql
        ;;
    preview)
        info "read-only: rows in scope"
        require_section preview | run_sql
        echo
        info "any '!!' count above must be 0 before a hard delete"
        ;;
    dry-run)
        info "hard delete with COMMIT swapped for ROLLBACK — nothing is written"
        require_section hard | sed 's/^COMMIT;/ROLLBACK;/' | run_sql
        echo
        info "rolled back; no changes were made"
        ;;
    soft)
        confirm
        require_section soft | run_sql
        info "student accounts marked deleted_at. Undo:"
        echo "  psql -c \"UPDATE students SET deleted_at = NULL WHERE deleted_at IS NOT NULL\""
        warn "GET /students does not filter deleted_at (app/routes/students.py:485) — soft-deleted learners still appear there"
        ;;
    hard)
        [ "$DO_BACKUP" -eq 1 ] && backup
        confirm
        require_section hard | run_sql
        info "done — both remaining counts above should read 0"
        ;;
esac
