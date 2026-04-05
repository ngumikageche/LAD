def test_create_role_success(client):
    resp = client.post(
        "/roles",
        json={"role_name": "Admin", "permissions": {"*": True}},
    )

    assert resp.status_code == 201
    body = resp.get_json()
    assert body["id"]
    assert body["role_name"] == "Admin"
    assert body["permissions"] == {"*": True}


def test_create_role_missing_name_400(client):
    resp = client.post("/roles", json={"permissions": {"*": True}})
    assert resp.status_code == 400


def test_create_role_duplicate_409(client):
    r1 = client.post("/roles", json={"role_name": "Student", "permissions": {}})
    assert r1.status_code == 201

    r2 = client.post("/roles", json={"role_name": "Student", "permissions": {}})
    assert r2.status_code == 409


def test_create_role_permissions_default_empty_object(client):
    resp = client.post("/roles", json={"role_name": "Trainer"})
    assert resp.status_code == 201
    body = resp.get_json()
    assert body["permissions"] == {}
