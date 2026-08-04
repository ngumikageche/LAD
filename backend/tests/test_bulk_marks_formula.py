from app.routes.bulk_marks import CAT_FORMULA_SCENARIOS, _calculate_cat_formula_marks


def test_cat_formula_scenario_1_calculates_raw_100_total():
    marks, details, errors = _calculate_cat_formula_marks(
        {"cat_1_marks": "20", "cat_2_marks": "35", "cat_3_marks": "25"},
        CAT_FORMULA_SCENARIOS["scenario_1"],
        None,
    )

    assert errors == []
    assert marks == 80
    assert details["component_total_marks"] == [30, 40, 30]
    assert details["final_percentage"] == 80


def test_cat_formula_scenario_3_normalizes_to_100_percent():
    marks, details, errors = _calculate_cat_formula_marks(
        {"cat_1_marks": "40", "cat_2_marks": "30", "cat_3_marks": "50"},
        CAT_FORMULA_SCENARIOS["scenario_3"],
        None,
    )

    assert errors == []
    assert marks == 50
    assert details["component_total_marks"] == [80, 60, 100]
    assert details["final_percentage"] == 50


def test_cat_formula_rejects_component_marks_above_maximum():
    marks, details, errors = _calculate_cat_formula_marks(
        {"cat_1_marks": "31", "cat_2_marks": "35", "cat_3_marks": "25"},
        CAT_FORMULA_SCENARIOS["scenario_1"],
        None,
    )

    assert marks is None
    assert details is None
    assert "cat_1_marks must be 0–30" in errors
