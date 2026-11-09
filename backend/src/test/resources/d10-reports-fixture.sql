-- SE2-D10-DB: synthetic data only, for a NEW isolated se_d10_qa_* database.
-- Harness supplies @qa_user_a and @qa_user_b after real register/login.
-- No credentials, migration or destructive cleanup in this fixture.
CREATE TEMPORARY TABLE d10_fixture_guard (ok INT NOT NULL CHECK (ok = 1));
INSERT INTO d10_fixture_guard VALUES (
    IF(DATABASE() LIKE 'se_d10_qa_%' AND @qa_user_a > 0 AND @qa_user_b > 0
       AND @qa_user_a <> @qa_user_b, 1, 0));
DROP TEMPORARY TABLE d10_fixture_guard;

INSERT INTO categories(user_id, name, type, created_at)
VALUES (@qa_user_a, 'QA D10 Income', 'INCOME', NOW());
SET @qa_income_a = LAST_INSERT_ID();
INSERT INTO categories(user_id, name, type, created_at)
VALUES (@qa_user_a, 'QA D10 Food', 'EXPENSE', NOW());
SET @qa_food_a = LAST_INSERT_ID();
INSERT INTO categories(user_id, name, type, created_at)
VALUES (@qa_user_a, 'QA D10 Transport', 'EXPENSE', NOW());
SET @qa_transport_a = LAST_INSERT_ID();
INSERT INTO categories(user_id, name, type, created_at)
VALUES (@qa_user_a, 'QA D10 Unused', 'EXPENSE', NOW());
SET @qa_unused_a = LAST_INSERT_ID();
INSERT INTO categories(user_id, name, type, created_at)
VALUES (@qa_user_b, 'QA D10 Income', 'INCOME', NOW());
SET @qa_income_b = LAST_INSERT_ID();
INSERT INTO categories(user_id, name, type, created_at)
VALUES (@qa_user_b, 'QA D10 Food', 'EXPENSE', NOW());
SET @qa_food_b = LAST_INSERT_ID();

INSERT INTO transactions(user_id, category_id, type, amount, transaction_date, note, created_at) VALUES
(@qa_user_a,@qa_income_a,'INCOME',1000.10,'2026-09-01','D11 income',NOW()),
(@qa_user_a,@qa_income_a,'INCOME',0.20,'2026-09-30','D11 cents',NOW()),
(@qa_user_a,@qa_food_a,'EXPENSE',100.10,'2026-09-01','D11 food 1',NOW()),
(@qa_user_a,@qa_food_a,'EXPENSE',200.20,'2026-09-30','D11 food 2',NOW()),
(@qa_user_a,@qa_transport_a,'EXPENSE',50.05,'2026-09-15','D11 transport',NOW()),
(@qa_user_a,@qa_income_a,'INCOME',2000.00,'2026-11-01','D11 comparison',NOW()),
(@qa_user_a,@qa_food_a,'EXPENSE',350.25,'2026-11-02','D11 under budget',NOW()),
(@qa_user_a,@qa_transport_a,'EXPENSE',150.75,'2026-11-03','D11 over budget',NOW()),
(@qa_user_b,@qa_income_b,'INCOME',9000.00,'2026-09-01','Other owner',NOW()),
(@qa_user_b,@qa_food_b,'EXPENSE',999.99,'2026-09-15','Other owner',NOW()),
(@qa_user_a,@qa_income_a,'INCOME',1.11,'2026-05-01','Six month start',NOW()),
(@qa_user_a,@qa_food_a,'EXPENSE',2.22,'2026-06-30','Six month end',NOW()),
(@qa_user_a,@qa_food_a,'EXPENSE',22.22,'2025-12-31','Year boundary',NOW()),
(@qa_user_a,@qa_income_a,'INCOME',111.11,'2026-01-01','Year boundary',NOW()),
(@qa_user_a,@qa_income_a,'INCOME',0.20,'2024-02-28','Leap year',NOW()),
(@qa_user_a,@qa_food_a,'EXPENSE',0.10,'2024-02-29','Leap day',NOW()),
(@qa_user_a,@qa_food_a,'EXPENSE',900.00,'2024-03-01','Outside leap month',NOW()),
(@qa_user_a,@qa_income_a,'INCOME',1.90,'1900-01-01','Minimum year',NOW()),
(@qa_user_a,@qa_food_a,'EXPENSE',2.10,'2100-12-31','Maximum year',NOW()),
(@qa_user_a,@qa_income_a,'INCOME',900.00,'2026-08-31','Outside range',NOW()),
(@qa_user_a,@qa_food_a,'EXPENSE',800.00,'2026-12-01','Outside range',NOW()),
(@qa_user_a,@qa_income_a,'INCOME',0.10,'2030-01-01','Decimal precision',NOW()),
(@qa_user_a,@qa_income_a,'INCOME',0.20,'2030-01-01','Decimal precision',NOW()),
(@qa_user_a,@qa_food_a,'EXPENSE',9999999999999.99,'2030-01-31','Large aggregate 1',NOW()),
(@qa_user_a,@qa_food_a,'EXPENSE',9999999999999.99,'2030-01-31','Large aggregate 2',NOW());

INSERT INTO monthly_budgets(user_id,`year`,`month`,amount_limit) VALUES
(@qa_user_a,2026,9,500.00),(@qa_user_a,2026,11,400.00);
INSERT INTO category_budgets(user_id,category_id,`year`,`month`,amount_limit) VALUES
(@qa_user_a,@qa_food_a,2026,11,1000.00),
(@qa_user_a,@qa_transport_a,2026,11,100.00);

SELECT JSON_OBJECT('income_a',@qa_income_a,'food_a',@qa_food_a,
    'transport_a',@qa_transport_a,'unused_a',@qa_unused_a,
    'income_b',@qa_income_b,'food_b',@qa_food_b);
