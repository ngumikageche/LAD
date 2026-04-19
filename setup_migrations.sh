#!/bin/bash

# Script to generate and apply database migrations for LAD backend

echo "=========================================="
echo "LAD Database Migration Setup"
echo "=========================================="
echo ""

# Check if we're in the right directory
if [ ! -f "wsgi.py" ]; then
    echo "❌ Error: wsgi.py not found. Please run this script from the Backend directory."
    exit 1
fi

echo "✅ Current directory: $(pwd)"
echo ""

# Generate migration
echo "📝 Generating database migration..."
cd Backend
export FLASK_APP=wsgi.py
python -m flask db migrate -m "Add student academic models (Score, Enrollment, Term, Assessment, Announcement, TrainerCourse)"

if [ $? -eq 0 ]; then
    echo "✅ Migration generated successfully!"
    echo ""
    
    # Show migration file
    latest_migration=$(ls migrations/versions/*.py | tail -1)
    echo "📄 Latest migration: $latest_migration"
    echo ""
    
    # Apply migration
    read -p "Apply migration now? (y/n) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        echo "📥 Applying migration to database..."
        python -m flask db upgrade
        
        if [ $? -eq 0 ]; then
            echo "✅ Migration applied successfully!"
            echo ""
            echo "=========================================="
            echo "✨ Database setup complete!"
            echo "=========================================="
        else
            echo "❌ Error applying migration"
            exit 1
        fi
    fi
else
    echo "❌ Error generating migration"
    exit 1
fi
