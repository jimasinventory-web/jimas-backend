-- =============================================================================
-- JIMAS COMPUTERS NIGERIA LIMITED - DATABASE SCHEMA
-- PostgreSQL. Reconstructed from the API so you can recreate the database
-- (e.g. on a new Render Postgres instance) or understand the data model.
--
-- HOW TO USE:
--   1. Create a PostgreSQL database (Render, Supabase, Neon, local, etc.)
--   2. Run this file against it, e.g.:
--        psql "<YOUR_DATABASE_URL>" -f schema.sql
--   3. Create your first admin (see the bottom of this file).
-- =============================================================================

-- ---------- BRANCHES ----------
CREATE TABLE IF NOT EXISTS branches (
  id         SERIAL PRIMARY KEY,
  name       VARCHAR(255) NOT NULL UNIQUE,
  location   VARCHAR(255) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------- USERS ----------
-- role is one of: 'admin', 'sales'
CREATE TABLE IF NOT EXISTS users (
  id         SERIAL PRIMARY KEY,
  name       VARCHAR(255) NOT NULL,
  email      VARCHAR(255) NOT NULL UNIQUE,
  password   VARCHAR(255) NOT NULL,               -- bcrypt hash
  role       VARCHAR(50)  NOT NULL DEFAULT 'sales',
  branch_id  INTEGER REFERENCES branches(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------- SUPPLIERS ----------
CREATE TABLE IF NOT EXISTS suppliers (
  id           SERIAL PRIMARY KEY,
  name         VARCHAR(255) NOT NULL UNIQUE,
  contact_info VARCHAR(255),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------- SERIAL NUMBERS (INVENTORY) ----------
-- status is one of: 'available', 'sold', 'returned'
CREATE TABLE IF NOT EXISTS serial_numbers (
  id             SERIAL PRIMARY KEY,
  product_name   VARCHAR(255) NOT NULL,
  specifications TEXT,
  serial_number  VARCHAR(255) NOT NULL UNIQUE,
  branch_id      INTEGER NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
  supplier_id    INTEGER REFERENCES suppliers(id) ON DELETE SET NULL,
  cost_price     NUMERIC(14,2) NOT NULL DEFAULT 0,
  sale_price     NUMERIC(14,2),
  status         VARCHAR(20) NOT NULL DEFAULT 'available',
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------- CREDIT CUSTOMERS ----------
-- customer_type is one of: 'regular', 'bulk_reseller'
CREATE TABLE IF NOT EXISTS credit_customers (
  id              SERIAL PRIMARY KEY,
  name            VARCHAR(255) NOT NULL,
  contact_info    VARCHAR(255) NOT NULL UNIQUE,
  customer_type   VARCHAR(50)  NOT NULL DEFAULT 'regular',
  open_balance    NUMERIC(14,2) NOT NULL DEFAULT 0,
  total_purchases NUMERIC(14,2) NOT NULL DEFAULT 0,
  branch_id       INTEGER REFERENCES branches(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------- SALES ----------
-- payment_type is typically 'cash' or 'credit'
CREATE TABLE IF NOT EXISTS sales (
  id                 SERIAL PRIMARY KEY,
  branch_id          INTEGER NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
  sold_by_email      VARCHAR(255) NOT NULL,
  payment_type       VARCHAR(50)  NOT NULL,
  customer_name      VARCHAR(255) NOT NULL,
  customer_phone     VARCHAR(50)  NOT NULL,
  subtotal           NUMERIC(14,2) NOT NULL DEFAULT 0,
  vat_enabled        BOOLEAN NOT NULL DEFAULT FALSE,
  vat_percentage     NUMERIC(6,2)  NOT NULL DEFAULT 0,
  vat_amount         NUMERIC(14,2) NOT NULL DEFAULT 0,
  total_amount       NUMERIC(14,2) NOT NULL DEFAULT 0,
  total_cost         NUMERIC(14,2) NOT NULL DEFAULT 0,
  total_profit       NUMERIC(14,2) NOT NULL DEFAULT 0,
  unsettled_balance  NUMERIC(14,2) NOT NULL DEFAULT 0,
  is_credit          BOOLEAN NOT NULL DEFAULT FALSE,
  credit_customer_id INTEGER REFERENCES credit_customers(id) ON DELETE SET NULL,
  is_voided          BOOLEAN NOT NULL DEFAULT FALSE,
  sales_note         TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------- SALE ITEMS ----------
CREATE TABLE IF NOT EXISTS sale_items (
  id                   SERIAL PRIMARY KEY,
  sale_id              INTEGER NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
  serial_number_id     INTEGER NOT NULL REFERENCES serial_numbers(id) ON DELETE RESTRICT,
  price                NUMERIC(14,2) NOT NULL DEFAULT 0,
  ram_upgrade_price    NUMERIC(14,2) NOT NULL DEFAULT 0,
  storage_upgrade_price NUMERIC(14,2) NOT NULL DEFAULT 0,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------- CREDIT PAYMENTS ----------
CREATE TABLE IF NOT EXISTS credit_payments (
  id                 SERIAL PRIMARY KEY,
  credit_customer_id INTEGER NOT NULL REFERENCES credit_customers(id) ON DELETE CASCADE,
  amount             NUMERIC(14,2) NOT NULL DEFAULT 0,
  sale_id            INTEGER REFERENCES sales(id) ON DELETE SET NULL,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------- BULK RESELLER ITEMS ----------
-- reseller_id references a credit_customers row whose customer_type = 'bulk_reseller'
-- payment_status is one of: 'unpaid', 'partially_paid', 'fully_paid'
CREATE TABLE IF NOT EXISTS bulk_reseller_items (
  id               SERIAL PRIMARY KEY,
  reseller_id      INTEGER NOT NULL REFERENCES credit_customers(id) ON DELETE CASCADE,
  serial_number_id INTEGER NOT NULL REFERENCES serial_numbers(id) ON DELETE RESTRICT,
  given_price      NUMERIC(14,2) NOT NULL DEFAULT 0,
  payment_status   VARCHAR(20) NOT NULL DEFAULT 'unpaid',
  amount_paid      NUMERIC(14,2) NOT NULL DEFAULT 0,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------- BULK RESELLER PAYMENTS ----------
CREATE TABLE IF NOT EXISTS bulk_reseller_payments (
  id          SERIAL PRIMARY KEY,
  reseller_id INTEGER NOT NULL REFERENCES credit_customers(id) ON DELETE CASCADE,
  amount      NUMERIC(14,2) NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------- SUPPLIER FAULT REPORTS ----------
CREATE TABLE IF NOT EXISTS supplier_fault_reports (
  id               SERIAL PRIMARY KEY,
  supplier_id      INTEGER NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
  total_supplied   INTEGER NOT NULL DEFAULT 0,
  good_units       INTEGER NOT NULL DEFAULT 0,
  total_faulty     INTEGER NOT NULL DEFAULT 0,
  faults_breakdown JSONB,
  notes            TEXT,
  reported_by      VARCHAR(255),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------- HELPFUL INDEXES ----------
CREATE INDEX IF NOT EXISTS idx_serial_numbers_status     ON serial_numbers(status);
CREATE INDEX IF NOT EXISTS idx_serial_numbers_branch     ON serial_numbers(branch_id);
CREATE INDEX IF NOT EXISTS idx_serial_numbers_product    ON serial_numbers(product_name);
CREATE INDEX IF NOT EXISTS idx_sales_branch              ON sales(branch_id);
CREATE INDEX IF NOT EXISTS idx_sales_created_at          ON sales(created_at);
CREATE INDEX IF NOT EXISTS idx_sale_items_sale           ON sale_items(sale_id);
CREATE INDEX IF NOT EXISTS idx_credit_payments_customer  ON credit_payments(credit_customer_id);
CREATE INDEX IF NOT EXISTS idx_bulk_items_reseller       ON bulk_reseller_items(reseller_id);
CREATE INDEX IF NOT EXISTS idx_bulk_payments_reseller    ON bulk_reseller_payments(reseller_id);

-- =============================================================================
-- CREATE YOUR FIRST ADMIN
-- =============================================================================
-- 1. Generate a bcrypt hash of your chosen password. From the backend folder:
--        node hash-password.js       (edit the password inside that file first)
--    Copy the printed hash.
--
-- 2. Insert the admin (replace the email and the hash below):
--
--    INSERT INTO users (name, email, password, role)
--    VALUES ('Administrator', 'admin@jimas.com', '<PASTE_BCRYPT_HASH_HERE>', 'admin');
--
-- After that you can log in and create branches, staff, suppliers, etc. from the app.
-- =============================================================================
