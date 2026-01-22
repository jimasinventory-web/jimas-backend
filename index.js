// ========================================
// JIMAS COMPUTERS - INVENTORY & POS SYSTEM
// Complete Backend API with All Features
// ========================================

// -----------------------------
// IMPORTS
// -----------------------------
const cors = require('cors');
const express = require("express");
const { Pool } = require("pg");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const bodyParser = require("body-parser");
const PDFDocument = require('pdfkit');

const app = express();
const PORT = process.env.PORT || 3000;

// -----------------------------
// MIDDLEWARE
// -----------------------------
app.use(bodyParser.json());
app.use(cors());

// -----------------------------
// DATABASE CONNECTION
// -----------------------------
// PLACEHOLDER: Replace with your Render PostgreSQL connection string
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || "postgresql://jedidiahtester:PSbUUfVPWfgnmSssQwExBIKT3kSAVU8c@dpg-d5p5mqvgi27c73c390rg-a.frankfurt-postgres.render.com/jimas_db_test",
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false
});

// Test database connection
pool.on('connect', () => {
  console.log('✅ Connected to PostgreSQL database');
});

pool.on('error', (err) => {
  console.error('❌ Database connection error:', err);
});

// -----------------------------
// JWT SECRET
// -----------------------------
const JWT_SECRET = process.env.JWT_SECRET || "supersecretkey_change_in_production";

// -----------------------------
// DATABASE SCHEMA CREATION
// -----------------------------
async function initializeDatabase() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Users table
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        role VARCHAR(50) NOT NULL CHECK (role IN ('admin', 'sales')),
        branch_id INTEGER,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Branches table
    await client.query(`
      CREATE TABLE IF NOT EXISTS branches (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) UNIQUE NOT NULL,
        location TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Suppliers table
    await client.query(`
      CREATE TABLE IF NOT EXISTS suppliers (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) UNIQUE NOT NULL,
        contact_info TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Serial numbers (inventory) table
    await client.query(`
      CREATE TABLE IF NOT EXISTS serial_numbers (
        id SERIAL PRIMARY KEY,
        product_name VARCHAR(255) NOT NULL,
        specifications TEXT,
        serial_number VARCHAR(255) UNIQUE NOT NULL,
        branch_id INTEGER REFERENCES branches(id),
        supplier_id INTEGER REFERENCES suppliers(id),
        cost_price DECIMAL(15, 2) NOT NULL,
        sale_price DECIMAL(15, 2),
        status VARCHAR(50) DEFAULT 'available' CHECK (status IN ('available', 'sold', 'returned', 'transferred')),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Credit customers table
    await client.query(`
      CREATE TABLE IF NOT EXISTS credit_customers (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        contact_info VARCHAR(255) UNIQUE NOT NULL,
        customer_type VARCHAR(50) DEFAULT 'regular' CHECK (customer_type IN ('regular', 'bulk_reseller')),
        open_balance DECIMAL(15, 2) DEFAULT 0,
        total_purchases DECIMAL(15, 2) DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Sales table
    await client.query(`
      CREATE TABLE IF NOT EXISTS sales (
        id SERIAL PRIMARY KEY,
        branch_id INTEGER REFERENCES branches(id),
        sold_by_email VARCHAR(255) NOT NULL,
        payment_type VARCHAR(50) NOT NULL CHECK (payment_type IN ('cash', 'credit')),
        customer_name VARCHAR(255) NOT NULL,
        customer_phone VARCHAR(255) NOT NULL,
        total_amount DECIMAL(15, 2) NOT NULL,
        total_cost DECIMAL(15, 2) NOT NULL,
        total_profit DECIMAL(15, 2) NOT NULL,
        unsettled_balance DECIMAL(15, 2) DEFAULT 0,
        is_credit BOOLEAN DEFAULT false,
        credit_customer_id INTEGER REFERENCES credit_customers(id),
        is_voided BOOLEAN DEFAULT false,
        vat_percentage DECIMAL(5, 2) DEFAULT 0,
        vat_amount DECIMAL(15, 2) DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Sale items table
    await client.query(`
      CREATE TABLE IF NOT EXISTS sale_items (
        id SERIAL PRIMARY KEY,
        sale_id INTEGER REFERENCES sales(id) ON DELETE CASCADE,
        serial_number_id INTEGER REFERENCES serial_numbers(id),
        price DECIMAL(15, 2) NOT NULL,
        ram_upgrade_price DECIMAL(15, 2) DEFAULT 0,
        storage_upgrade_price DECIMAL(15, 2) DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Credit payments table
    await client.query(`
      CREATE TABLE IF NOT EXISTS credit_payments (
        id SERIAL PRIMARY KEY,
        credit_customer_id INTEGER REFERENCES credit_customers(id),
        amount DECIMAL(15, 2) NOT NULL,
        sale_id INTEGER REFERENCES sales(id),
        payment_type VARCHAR(50) DEFAULT 'partial' CHECK (payment_type IN ('partial', 'full')),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Stock transfers table
    await client.query(`
      CREATE TABLE IF NOT EXISTS stock_transfers (
        id SERIAL PRIMARY KEY,
        serial_number_id INTEGER REFERENCES serial_numbers(id),
        from_branch_id INTEGER REFERENCES branches(id),
        to_branch_id INTEGER REFERENCES branches(id),
        transferred_by_email VARCHAR(255) NOT NULL,
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Supplier fault reports table
    await client.query(`
      CREATE TABLE IF NOT EXISTS supplier_fault_reports (
        id SERIAL PRIMARY KEY,
        supplier_id INTEGER REFERENCES suppliers(id),
        report_date DATE DEFAULT CURRENT_DATE,
        total_supplied INTEGER NOT NULL,
        good_units INTEGER NOT NULL,
        faulty_keyboard INTEGER DEFAULT 0,
        faulty_screen INTEGER DEFAULT 0,
        not_charging INTEGER DEFAULT 0,
        faulty_touchpad INTEGER DEFAULT 0,
        bad_hinge INTEGER DEFAULT 0,
        faulty_battery INTEGER DEFAULT 0,
        no_display INTEGER DEFAULT 0,
        faulty_wifi INTEGER DEFAULT 0,
        faulty_speakers INTEGER DEFAULT 0,
        faulty_webcam INTEGER DEFAULT 0,
        overheating INTEGER DEFAULT 0,
        slow_performance INTEGER DEFAULT 0,
        faulty_ports INTEGER DEFAULT 0,
        physical_damage INTEGER DEFAULT 0,
        bios_issues INTEGER DEFAULT 0,
        other_issue INTEGER DEFAULT 0,
        other_description TEXT,
        reported_by_email VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await client.query('COMMIT');
    console.log('✅ Database schema initialized successfully');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Error initializing database:', err.message);
    throw err;
  } finally {
    client.release();
  }
}

// Initialize database on startup
initializeDatabase().catch(err => {
  console.error('Failed to initialize database:', err);
});

// -----------------------------
// HELPER FUNCTIONS
// -----------------------------

// Validation helper
function validateRequiredFields(required, body) {
  const missing = required.filter(
    f => !(f in body) || body[f] === "" || body[f] === null || body[f] === undefined
  );
  return missing.length ? `Missing fields: ${missing.join(", ")}` : null;
}

// Lookup helpers
async function getUserByEmail(email) {
  const r = await pool.query("SELECT * FROM users WHERE email=$1", [email]);
  return r.rows[0] || null;
}

async function getBranchByName(name) {
  const r = await pool.query("SELECT * FROM branches WHERE name=$1", [name]);
  return r.rows[0] || null;
}

async function getBranchById(id) {
  const r = await pool.query("SELECT * FROM branches WHERE id=$1", [id]);
  return r.rows[0] || null;
}

async function getSupplierByName(name) {
  const r = await pool.query("SELECT * FROM suppliers WHERE name=$1", [name]);
  return r.rows[0] || null;
}

async function getSupplierById(id) {
  const r = await pool.query("SELECT * FROM suppliers WHERE id=$1", [id]);
  return r.rows[0] || null;
}

// -----------------------------
// AUTH MIDDLEWARE
// -----------------------------
function authenticate(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth) return res.status(401).json({ error: "Invalid or missing token" });

  try {
    const token = auth.split(" ")[1];
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: "Invalid or missing token" });
  }
}

function authorizeAdmin(req, res, next) {
  if (req.user.role !== "admin") {
    return res.status(403).json({ error: "Admin only" });
  }
  next();
}

// -----------------------------
// PDF RECEIPT GENERATORS
// -----------------------------

// Cash/Credit Sale Receipt Generator
function generateSaleReceiptPDF(saleData, res) {
  const doc = new PDFDocument({ 
    size: [226.77, 600],
    margins: { top: 10, bottom: 10, left: 10, right: 10 }
  });

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename=receipt_${saleData.sale_id}.pdf`);

  doc.pipe(res);

  // Business Name
  doc.fontSize(16).font('Helvetica-Bold').text('JIMAS COMPUTERS', { align: 'center' });
  doc.fontSize(16).font('Helvetica-Bold').text('NIGERIA LIMITED', { align: 'center' });
  doc.moveDown(0.5);

  // Business Address
  doc.fontSize(8).font('Helvetica').text('No. 9 Medical Road, opposite zenith Bank', { align: 'center' });
  doc.text('on medical road computer village Ikeja lagos.', { align: 'center' });
  doc.moveDown(1);

  // Date
  doc.fontSize(9).font('Helvetica').text(`Date: ${new Date(saleData.date).toLocaleString()}`, { align: 'left' });
  doc.moveDown(0.5);

  // Sale ID
  doc.fontSize(11).font('Helvetica-Bold').text(`SALE ID: ${saleData.sale_id}`, { align: 'left' });
  doc.moveDown(0.5);

  // Separator
  doc.fontSize(8).text('----------------------------------------', { align: 'center' });
  doc.moveDown(0.3);

  // Items Header
  doc.fontSize(9).font('Helvetica-Bold').text('ITEMS:', { align: 'left' });
  doc.moveDown(0.3);

  // List items
  saleData.items.forEach((item, index) => {
    doc.fontSize(8).font('Helvetica').text(`${index + 1}. ${item.product_name}`, { align: 'left' });
    doc.fontSize(8).text(`   Serial: ${item.serial_number}`, { align: 'left' });
    doc.fontSize(8).text(`   Price: ₦${parseFloat(item.price).toLocaleString()}`, { align: 'left' });
    
    if (item.ram_upgrade_price && item.ram_upgrade_price > 0) {
      doc.fontSize(8).text(`   RAM Upgrade: ₦${parseFloat(item.ram_upgrade_price).toLocaleString()}`, { align: 'left' });
    }
    
    if (item.storage_upgrade_price && item.storage_upgrade_price > 0) {
      doc.fontSize(8).text(`   Storage Upgrade: ₦${parseFloat(item.storage_upgrade_price).toLocaleString()}`, { align: 'left' });
    }
    
    doc.moveDown(0.3);
  });

  // Separator
  doc.fontSize(8).text('----------------------------------------', { align: 'center' });
  doc.moveDown(0.3);

  // Subtotal and VAT
  const subtotal = parseFloat(saleData.total_amount) - parseFloat(saleData.vat_amount || 0);
  doc.fontSize(9).font('Helvetica').text(`SUBTOTAL: ₦${subtotal.toLocaleString()}`, { align: 'right' });
  
  if (saleData.vat_amount && saleData.vat_amount > 0) {
    doc.fontSize(9).text(`VAT (${saleData.vat_percentage}%): ₦${parseFloat(saleData.vat_amount).toLocaleString()}`, { align: 'right' });
  }
  
  // Total
  doc.fontSize(10).font('Helvetica-Bold').text(`TOTAL: ₦${parseFloat(saleData.total_amount).toLocaleString()}`, { align: 'right' });
  doc.moveDown(0.5);

  // Payment Type
  doc.fontSize(9).font('Helvetica').text(`Payment: ${saleData.payment_type.toUpperCase()}`, { align: 'left' });
  doc.moveDown(0.5);

  // Separator
  doc.fontSize(8).text('----------------------------------------', { align: 'center' });
  doc.moveDown(0.3);

  // Customer Info
  doc.fontSize(9).font('Helvetica-Bold').text('CUSTOMER INFORMATION:', { align: 'left' });
  doc.fontSize(9).font('Helvetica').text(`Name: ${saleData.customer_name}`, { align: 'left' });
  doc.fontSize(9).text(`Phone: ${saleData.customer_phone}`, { align: 'left' });
  doc.moveDown(1);

  // Footer
  doc.fontSize(8).font('Helvetica-Oblique').text('Thank you for your business!', { align: 'center' });
  doc.fontSize(7).text('Please keep this receipt for warranty claims', { align: 'center' });

  doc.end();
}

// Credit Payment Receipt Generator
function generateCreditPaymentReceiptPDF(paymentData, res) {
  const doc = new PDFDocument({ 
    size: [226.77, 400],
    margins: { top: 10, bottom: 10, left: 10, right: 10 }
  });

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename=credit_payment_${paymentData.payment_id}.pdf`);

  doc.pipe(res);

  // Business Name
  doc.fontSize(16).font('Helvetica-Bold').text('JIMAS COMPUTERS', { align: 'center' });
  doc.fontSize(16).font('Helvetica-Bold').text('NIGERIA LIMITED', { align: 'center' });
  doc.moveDown(0.5);

  // Business Address
  doc.fontSize(8).font('Helvetica').text('No. 9 Medical Road, opposite zenith Bank', { align: 'center' });
  doc.text('on medical road computer village Ikeja lagos.', { align: 'center' });
  doc.moveDown(1);

  // Receipt Title
  doc.fontSize(12).font('Helvetica-Bold').text('CREDIT PAYMENT RECEIPT', { align: 'center' });
  doc.moveDown(1);

  // Separator
  doc.fontSize(8).text('----------------------------------------', { align: 'center' });
  doc.moveDown(0.5);

  // Customer Info
  doc.fontSize(9).font('Helvetica-Bold').text('CUSTOMER:', { align: 'left' });
  doc.fontSize(9).font('Helvetica').text(`Name: ${paymentData.customer_name}`, { align: 'left' });
  doc.fontSize(9).text(`Phone: ${paymentData.customer_phone}`, { align: 'left' });
  doc.moveDown(0.5);

  // Payment Info
  if (paymentData.customer_type === 'regular') {
    doc.fontSize(9).font('Helvetica-Bold').text(`Sale ID: ${paymentData.sale_id}`, { align: 'left' });
    doc.fontSize(9).font('Helvetica').text(`Laptop: ${paymentData.laptop_name || 'N/A'}`, { align: 'left' });
    doc.fontSize(9).text(`Date Bought: ${new Date(paymentData.sale_date).toLocaleDateString()}`, { align: 'left' });
    doc.moveDown(0.5);
  }

  // Payment Details
  doc.fontSize(9).font('Helvetica').text(`Payment Date: ${new Date(paymentData.payment_date).toLocaleDateString()}`, { align: 'left' });
  doc.fontSize(10).font('Helvetica-Bold').text(`Amount Paid: ₦${parseFloat(paymentData.amount_paid).toLocaleString()}`, { align: 'left' });
  doc.moveDown(0.3);

  if (paymentData.customer_type === 'regular') {
    doc.fontSize(9).font('Helvetica').text(`Total Paid So Far: ₦${parseFloat(paymentData.total_paid).toLocaleString()}`, { align: 'left' });
  }

  doc.fontSize(10).font('Helvetica-Bold').text(`Balance Remaining: ₦${parseFloat(paymentData.balance_remaining).toLocaleString()}`, { align: 'left' });
  doc.moveDown(1);

  // Separator
  doc.fontSize(8).text('----------------------------------------', { align: 'center' });
  doc.moveDown(0.5);

  // Footer
  doc.fontSize(8).font('Helvetica-Oblique').text('Thank you for your payment!', { align: 'center' });
  doc.fontSize(7).text('Please keep this receipt for your records', { align: 'center' });

  doc.end();
}
// -----------------------------
// AUTHENTICATION ROUTES
// -----------------------------

// Login
app.post("/login", async (req, res) => {
  const err = validateRequiredFields(["email", "password"], req.body);
  if (err) return res.status(400).json({ error: err });

  try {
    const user = await getUserByEmail(req.body.email);
    if (!user) return res.status(400).json({ error: "User not found" });

    const valid = await bcrypt.compare(req.body.password, user.password);
    if (!valid) return res.status(400).json({ error: "Invalid password" });

    const token = jwt.sign(
      { email: user.email, role: user.role, branch_id: user.branch_id },
      JWT_SECRET,
      { expiresIn: "12h" }
    );

    res.json({ 
      token, 
      role: user.role, 
      branch_id: user.branch_id,
      name: user.name 
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: "Login failed" });
  }
});

// Register User (Admin Only)
app.post("/register", authenticate, authorizeAdmin, async (req, res) => {
  const err = validateRequiredFields(["name", "email", "password", "role"], req.body);
  if (err) return res.status(400).json({ error: err });

  const { name, email, password, role, branch_name } = req.body;

  try {
    // Check if user already exists
    const existing = await getUserByEmail(email);
    if (existing) return res.status(400).json({ error: "User already exists" });

    let branch_id = null;
    if (role === "sales") {
      if (!branch_name) return res.status(400).json({ error: "Missing fields: branch_name" });
      const branch = await getBranchByName(branch_name);
      if (!branch) return res.status(400).json({ error: "Branch not found" });
      branch_id = branch.id;
    }

    const hash = await bcrypt.hash(password, 10);
    await pool.query(
      "INSERT INTO users (name, email, password, role, branch_id) VALUES ($1, $2, $3, $4, $5)",
      [name, email, hash, role.toLowerCase(), branch_id]
    );

    res.json({ message: "User registered successfully" });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: "Registration failed" });
  }
});

// Get All Users (Admin Only)
app.get("/users", authenticate, authorizeAdmin, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT u.id, u.name, u.email, u.role, u.created_at, b.name AS branch_name
       FROM users u
       LEFT JOIN branches b ON b.id = u.branch_id
       ORDER BY u.created_at DESC`
    );
    
    res.json({ users: result.rows });
  } catch (err) {
    console.error('Error loading users:', err.message);
    res.status(500).json({ error: 'Failed to load users' });
  }
});

// Delete User (Admin Only)
app.delete("/users/:user_id", authenticate, authorizeAdmin, async (req, res) => {
  const { user_id } = req.params;

  try {
    const userCheck = await pool.query("SELECT * FROM users WHERE id = $1", [user_id]);
    
    if (!userCheck.rows.length) {
      return res.status(404).json({ error: "User not found" });
    }

    const userToDelete = userCheck.rows[0];

    // Prevent deleting yourself
    if (userToDelete.email === req.user.email) {
      return res.status(400).json({ error: "You cannot delete your own account" });
    }

    await pool.query("DELETE FROM users WHERE id = $1", [user_id]);

    res.json({ 
      message: "User deleted successfully",
      user_id: user_id 
    });

  } catch (err) {
    console.error("Error deleting user:", err.message);
    res.status(500).json({ error: "Failed to delete user" });
  }
});

// -----------------------------
// BRANCH ROUTES
// -----------------------------

// Create Branch (Admin Only)
app.post("/branch", authenticate, authorizeAdmin, async (req, res) => {
  const err = validateRequiredFields(["name", "location"], req.body);
  if (err) return res.status(400).json({ error: err });

  const { name, location } = req.body;

  try {
    const existing = await getBranchByName(name);
    if (existing) return res.status(400).json({ error: "Branch already exists" });

    await pool.query("INSERT INTO branches (name, location) VALUES ($1, $2)", [name, location]);
    res.json({ message: "Branch created successfully" });
  } catch (error) {
    console.error('Error creating branch:', error);
    res.status(500).json({ error: "Failed to create branch" });
  }
});

// Get All Branches
app.get("/branches", authenticate, async (req, res) => {
  try {
    const result = await pool.query("SELECT id, name, location, created_at FROM branches ORDER BY name");
    res.json({ branches: result.rows });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// -----------------------------
// SUPPLIER ROUTES
// -----------------------------

// Create Supplier
app.post("/supplier", authenticate, async (req, res) => {
  const err = validateRequiredFields(["name", "contact_info"], req.body);
  if (err) return res.status(400).json({ error: err });

  const { name, contact_info } = req.body;

  try {
    const existing = await getSupplierByName(name);
    if (existing) return res.status(400).json({ error: "Supplier already exists" });

    await pool.query("INSERT INTO suppliers (name, contact_info) VALUES ($1, $2)", [name, contact_info]);
    res.json({ message: "Supplier added successfully" });
  } catch (error) {
    console.error('Error creating supplier:', error);
    res.status(500).json({ error: "Failed to create supplier" });
  }
});

// Get All Suppliers
app.get("/suppliers", authenticate, async (req, res) => {
  try {
    const result = await pool.query("SELECT id, name, contact_info, created_at FROM suppliers ORDER BY name");
    res.json({ suppliers: result.rows });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// -----------------------------
// SUPPLIER FAULT REPORT ROUTES
// -----------------------------

// Create Supplier Fault Report
app.post("/supplier-fault-report", authenticate, async (req, res) => {
  const err = validateRequiredFields([
    "supplier_name", 
    "total_supplied", 
    "good_units"
  ], req.body);
  
  if (err) return res.status(400).json({ error: err });

  const {
    supplier_name,
    report_date,
    total_supplied,
    good_units,
    faulty_keyboard = 0,
    faulty_screen = 0,
    not_charging = 0,
    faulty_touchpad = 0,
    bad_hinge = 0,
    faulty_battery = 0,
    no_display = 0,
    faulty_wifi = 0,
    faulty_speakers = 0,
    faulty_webcam = 0,
    overheating = 0,
    slow_performance = 0,
    faulty_ports = 0,
    physical_damage = 0,
    bios_issues = 0,
    other_issue = 0,
    other_description = ""
  } = req.body;

  try {
    const supplier = await getSupplierByName(supplier_name);
    if (!supplier) return res.status(400).json({ error: "Supplier not found" });

    // Calculate total faulty
    const totalFaulty = parseInt(faulty_keyboard) + parseInt(faulty_screen) + 
                        parseInt(not_charging) + parseInt(faulty_touchpad) + 
                        parseInt(bad_hinge) + parseInt(faulty_battery) + 
                        parseInt(no_display) + parseInt(faulty_wifi) + 
                        parseInt(faulty_speakers) + parseInt(faulty_webcam) + 
                        parseInt(overheating) + parseInt(slow_performance) + 
                        parseInt(faulty_ports) + parseInt(physical_damage) + 
                        parseInt(bios_issues) + parseInt(other_issue);

    // Validate totals
    if (parseInt(good_units) + totalFaulty !== parseInt(total_supplied)) {
      return res.status(400).json({ 
        error: "Total units mismatch. Good units + faulty units must equal total supplied" 
      });
    }

    await pool.query(
      `INSERT INTO supplier_fault_reports (
        supplier_id, report_date, total_supplied, good_units,
        faulty_keyboard, faulty_screen, not_charging, faulty_touchpad,
        bad_hinge, faulty_battery, no_display, faulty_wifi,
        faulty_speakers, faulty_webcam, overheating, slow_performance,
        faulty_ports, physical_damage, bios_issues, other_issue,
        other_description, reported_by_email
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22)`,
      [
        supplier.id, report_date || new Date().toISOString().split('T')[0], 
        total_supplied, good_units,
        faulty_keyboard, faulty_screen, not_charging, faulty_touchpad,
        bad_hinge, faulty_battery, no_display, faulty_wifi,
        faulty_speakers, faulty_webcam, overheating, slow_performance,
        faulty_ports, physical_damage, bios_issues, other_issue,
        other_description, req.user.email
      ]
    );

    res.json({ 
      message: "Supplier fault report created successfully",
      total_faulty: totalFaulty
    });
  } catch (error) {
    console.error('Error creating fault report:', error);
    res.status(500).json({ error: "Failed to create fault report" });
  }
});

// Get Supplier Fault Reports
app.get("/supplier-fault-reports", authenticate, async (req, res) => {
  try {
    const { supplier_name } = req.query;
    
    let query = `
      SELECT sfr.*, s.name AS supplier_name
      FROM supplier_fault_reports sfr
      JOIN suppliers s ON s.id = sfr.supplier_id
    `;
    
    const params = [];
    
    if (supplier_name) {
      query += " WHERE s.name ILIKE $1";
      params.push(`%${supplier_name}%`);
    }
    
    query += " ORDER BY sfr.created_at DESC";
    
    const result = await pool.query(query, params);
    res.json({ reports: result.rows });
  } catch (error) {
    console.error('Error loading fault reports:', error);
    res.status(500).json({ error: "Failed to load fault reports" });
  }
});

// Get Single Supplier Fault Report
app.get("/supplier-fault-reports/:report_id", authenticate, async (req, res) => {
  try {
    const { report_id } = req.params;
    
    const result = await pool.query(
      `SELECT sfr.*, s.name AS supplier_name
       FROM supplier_fault_reports sfr
       JOIN suppliers s ON s.id = sfr.supplier_id
       WHERE sfr.id = $1`,
      [report_id]
    );
    
    if (!result.rows.length) {
      return res.status(404).json({ error: "Report not found" });
    }
    
    res.json({ report: result.rows[0] });
  } catch (error) {
    console.error('Error loading fault report:', error);
    res.status(500).json({ error: "Failed to load fault report" });
  }
});

// -----------------------------
// STOCK/INVENTORY ROUTES
// -----------------------------

// Add Single Stock Item
app.post("/stock", authenticate, async (req, res) => {
  const err = validateRequiredFields([
    "product_name",
    "serial_number",
    "branch_name",
    "supplier_name",
    "cost_price"
  ], req.body);
  
  if (err) return res.status(400).json({ error: err });

  const { 
    product_name, 
    specifications = "", 
    serial_number, 
    branch_name, 
    supplier_name, 
    cost_price 
  } = req.body;

  try {
    const branch = await getBranchByName(branch_name);
    if (!branch) return res.status(400).json({ error: "Branch not found" });

    const supplier = await getSupplierByName(supplier_name);
    if (!supplier) return res.status(400).json({ error: "Supplier not found" });

    // Check authorization
    if (req.user.role === "sales" && req.user.branch_id !== branch.id) {
      return res.status(403).json({ error: "You can only add stock to your branch" });
    }

    // Check if serial already exists
    const serialCheck = await pool.query(
      "SELECT id FROM serial_numbers WHERE serial_number=$1", 
      [serial_number]
    );
    
    if (serialCheck.rows.length) {
      return res.status(400).json({ error: "Serial number already exists" });
    }

    await pool.query(
      `INSERT INTO serial_numbers 
       (product_name, specifications, serial_number, branch_id, supplier_id, cost_price, status)
       VALUES ($1, $2, $3, $4, $5, $6, 'available')`,
      [product_name, specifications, serial_number, branch.id, supplier.id, cost_price]
    );

    res.json({ message: "Stock added successfully" });
  } catch (error) {
    console.error('Error adding stock:', error);
    res.status(500).json({ error: "Failed to add stock" });
  }
});

// Add Bulk Stock (Multiple Serial Numbers)
app.post("/stock/bulk", authenticate, async (req, res) => {
  const err = validateRequiredFields([
    "product_name",
    "branch_name",
    "supplier_name",
    "cost_price",
    "serial_numbers"
  ], req.body);
  
  if (err) return res.status(400).json({ error: err });

  const { 
    product_name, 
    specifications = "", 
    branch_name, 
    supplier_name, 
    cost_price,
    serial_numbers // Array of serial numbers
  } = req.body;

  if (!Array.isArray(serial_numbers) || serial_numbers.length === 0) {
    return res.status(400).json({ error: "serial_numbers must be a non-empty array" });
  }

  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');

    const branch = await getBranchByName(branch_name);
    if (!branch) throw new Error("Branch not found");

    const supplier = await getSupplierByName(supplier_name);
    if (!supplier) throw new Error("Supplier not found");

    // Check authorization
    if (req.user.role === "sales" && req.user.branch_id !== branch.id) {
      throw new Error("You can only add stock to your branch");
    }

    const added = [];
    const duplicates = [];

    for (const serial of serial_numbers) {
      const serialTrimmed = serial.trim();
      
      if (!serialTrimmed) continue;

      // Check if serial already exists
      const serialCheck = await client.query(
        "SELECT id FROM serial_numbers WHERE serial_number=$1", 
        [serialTrimmed]
      );
      
      if (serialCheck.rows.length) {
        duplicates.push(serialTrimmed);
        continue;
      }

      await client.query(
        `INSERT INTO serial_numbers 
         (product_name, specifications, serial_number, branch_id, supplier_id, cost_price, status)
         VALUES ($1, $2, $3, $4, $5, $6, 'available')`,
        [product_name, specifications, serialTrimmed, branch.id, supplier.id, cost_price]
      );

      added.push(serialTrimmed);
    }

    await client.query('COMMIT');

    res.json({ 
      message: "Bulk stock added successfully",
      added_count: added.length,
      duplicate_count: duplicates.length,
      duplicates: duplicates
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error adding bulk stock:', error);
    res.status(500).json({ error: error.message });
  } finally {
    client.release();
  }
});

// Transfer Stock Between Branches (Admin Only)
app.post("/stock/transfer", authenticate, authorizeAdmin, async (req, res) => {
  const err = validateRequiredFields([
    "serial_number",
    "to_branch_name"
  ], req.body);
  
  if (err) return res.status(400).json({ error: err });

  const { serial_number, to_branch_name, notes = "" } = req.body;

  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');

    // Get laptop
    const laptopResult = await client.query(
      `SELECT sn.*, b.name AS current_branch_name
       FROM serial_numbers sn
       JOIN branches b ON b.id = sn.branch_id
       WHERE sn.serial_number = $1`,
      [serial_number]
    );

    if (!laptopResult.rows.length) {
      throw new Error("Laptop not found");
    }

    const laptop = laptopResult.rows[0];

    // Check if laptop is available
    if (laptop.status !== 'available' && laptop.status !== 'returned') {
      throw new Error(`Cannot transfer laptop with status: ${laptop.status}`);
    }

    // Get destination branch
    const toBranch = await getBranchByName(to_branch_name);
    if (!toBranch) throw new Error("Destination branch not found");

    // Check if already at destination
    if (laptop.branch_id === toBranch.id) {
      throw new Error("Laptop is already at the destination branch");
    }

    const fromBranchId = laptop.branch_id;

    // Update laptop branch
    await client.query(
      "UPDATE serial_numbers SET branch_id = $1, status = 'available' WHERE id = $2",
      [toBranch.id, laptop.id]
    );

    // Record transfer
    await client.query(
      `INSERT INTO stock_transfers 
       (serial_number_id, from_branch_id, to_branch_id, transferred_by_email, notes)
       VALUES ($1, $2, $3, $4, $5)`,
      [laptop.id, fromBranchId, toBranch.id, req.user.email, notes]
    );

    await client.query('COMMIT');

    res.json({ 
      message: "Stock transferred successfully",
      from_branch: laptop.current_branch_name,
      to_branch: to_branch_name,
      serial_number: serial_number
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error transferring stock:', error);
    res.status(500).json({ error: error.message });
  } finally {
    client.release();
  }
});

// Get Stock Transfer History (Admin Only)
app.get("/stock/transfers", authenticate, authorizeAdmin, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT st.*, 
              sn.product_name, sn.serial_number,
              fb.name AS from_branch_name,
              tb.name AS to_branch_name
       FROM stock_transfers st
       JOIN serial_numbers sn ON sn.id = st.serial_number_id
       JOIN branches fb ON fb.id = st.from_branch_id
       JOIN branches tb ON tb.id = st.to_branch_id
       ORDER BY st.created_at DESC
       LIMIT 100`
    );

    res.json({ transfers: result.rows });
  } catch (error) {
    console.error('Error loading transfers:', error);
    res.status(500).json({ error: "Failed to load transfer history" });
  }
});
// Delete Stock (Return to Supplier)
app.delete("/stock/:serial_number", authenticate, async (req, res) => {
  const { serial_number } = req.params;

  try {
    const laptop = await pool.query(
      "SELECT * FROM serial_numbers WHERE serial_number=$1",
      [serial_number]
    );

    if (!laptop.rows.length) {
      return res.status(404).json({ error: "Laptop not found" });
    }

    const laptopData = laptop.rows[0];

    // Authorization check
    if (req.user.role === "sales" && req.user.branch_id !== laptopData.branch_id) {
      return res.status(403).json({ error: "You can only delete stock from your branch" });
    }

    // Check if laptop has been sold
    if (laptopData.status === "sold") {
      return res.status(400).json({ 
        error: "Cannot delete sold laptops. Please process a return first." 
      });
    }

    await pool.query("DELETE FROM serial_numbers WHERE serial_number=$1", [serial_number]);

    res.json({ 
      message: "Laptop returned to supplier successfully",
      serial_number: serial_number
    });

  } catch (err) {
    console.error("Error deleting stock:", err.message);
    res.status(500).json({ error: "Failed to delete laptop" });
  }
});

// Get Stock Groups (Grouped by Product Name)
app.get("/stock/groups", authenticate, async (req, res) => {
  try {
    if (req.user.role === "sales") {
      const result = await pool.query(
        `SELECT product_name, COUNT(*) AS total_available
         FROM serial_numbers
         WHERE status IN ('available', 'returned') AND branch_id = $1
         GROUP BY product_name
         ORDER BY product_name`,
        [req.user.branch_id]
      );
      
      return res.json({ groups: result.rows });
    }

    const result = await pool.query(
      `SELECT sn.product_name, b.name AS branch_name, b.id AS branch_id, 
              COUNT(*) AS total_available
       FROM serial_numbers sn
       JOIN branches b ON b.id = sn.branch_id
       WHERE sn.status IN ('available', 'returned')
       GROUP BY sn.product_name, b.name, b.id
       ORDER BY sn.product_name, b.name`
    );

    res.json({ groups: result.rows });
  } catch (e) {
    console.error(e.message);
    res.status(500).json({ error: "Error fetching stock groups" });
  }
});

// Get Stock Items by Product Name
app.get("/stock/groups/:product_name", authenticate, async (req, res) => {
  try {
    const product = req.params.product_name;
    if (!product) return res.status(400).json({ error: "Product name missing" });

    if (req.user.role === "sales") {
      const result = await pool.query(
        `SELECT product_name, specifications, serial_number, cost_price, 
                sale_price, status, created_at
         FROM serial_numbers
         WHERE product_name=$1 AND status IN ('available', 'returned') 
               AND branch_id = $2
         ORDER BY created_at DESC`,
        [product, req.user.branch_id]
      );
      
      return res.json({ product_name: product, items: result.rows });
    }

    const result = await pool.query(
      `SELECT sn.product_name, sn.specifications, sn.serial_number, 
              sn.cost_price, sn.sale_price, sn.status, sn.created_at, 
              b.name AS branch_name, b.id AS branch_id
       FROM serial_numbers sn
       JOIN branches b ON b.id = sn.branch_id
       WHERE sn.product_name=$1 AND sn.status IN ('available', 'returned')
       ORDER BY b.name, sn.created_at DESC`,
      [product]
    );

    res.json({ product_name: product, items: result.rows });
  } catch (e) {
    console.error(e.message);
    res.status(500).json({ error: "Error fetching group items" });
  }
});

// QR Code Lookup Route
app.get("/lookup-serial/:serial_number", authenticate, async (req, res) => {
  try {
    const { serial_number } = req.params;
    
    const result = await pool.query(
      `SELECT sn.*, b.name AS branch_name, s.name AS supplier_name
       FROM serial_numbers sn
       JOIN branches b ON b.id = sn.branch_id
       JOIN suppliers s ON s.id = sn.supplier_id
       WHERE sn.serial_number = $1`,
      [serial_number]
    );

    if (!result.rows.length) {
      return res.status(404).json({ error: "Serial number not found" });
    }

    res.json({ laptop: result.rows[0] });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// -----------------------------
// CREDIT CUSTOMER ROUTES
// -----------------------------

// Get All Credit Customers
app.get("/credit-customers", authenticate, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, name, contact_info, customer_type, open_balance, 
              total_purchases, created_at
       FROM credit_customers
       ORDER BY name`
    );
    res.json({ customers: result.rows });
  } catch (e) {
    console.error(e.message);
    res.status(500).json({ error: "Error loading credit customers" });
  }
});

// Search Credit Customers (for sales dropdown)
app.get("/credit-customers/search", authenticate, async (req, res) => {
  try {
    const { q } = req.query;
    
    if (!q || q.trim() === "") {
      return res.status(400).json({ error: "Search query required" });
    }

    const searchTerm = `%${q}%`;
    
    const result = await pool.query(
      `SELECT id, name, contact_info, customer_type, open_balance
       FROM credit_customers
       WHERE name ILIKE $1 OR contact_info ILIKE $1
       ORDER BY name
       LIMIT 20`,
      [searchTerm]
    );

    res.json({ customers: result.rows });
  } catch (error) {
    console.error('Error searching customers:', error);
    res.status(500).json({ error: "Failed to search customers" });
  }
});

// Create/Update Credit Customer (Bulk Reseller)
app.post("/credit-customers/bulk-reseller", authenticate, async (req, res) => {
  const err = validateRequiredFields(["name", "contact_info"], req.body);
  if (err) return res.status(400).json({ error: err });

  const { name, contact_info } = req.body;

  try {
    // Check if customer exists
    const existing = await pool.query(
      "SELECT * FROM credit_customers WHERE contact_info = $1",
      [contact_info]
    );

    if (existing.rows.length) {
      // Update to bulk reseller if not already
      await pool.query(
        "UPDATE credit_customers SET customer_type = 'bulk_reseller', name = $1 WHERE contact_info = $2",
        [name, contact_info]
      );
      
      return res.json({ 
        message: "Customer updated to bulk reseller",
        customer_id: existing.rows[0].id 
      });
    }

    // Create new bulk reseller
    const result = await pool.query(
      `INSERT INTO credit_customers (name, contact_info, customer_type, open_balance, total_purchases)
       VALUES ($1, $2, 'bulk_reseller', 0, 0)
       RETURNING id`,
      [name, contact_info]
    );

    res.json({ 
      message: "Bulk reseller created successfully",
      customer_id: result.rows[0].id 
    });
  } catch (error) {
    console.error('Error creating bulk reseller:', error);
    res.status(500).json({ error: "Failed to create bulk reseller" });
  }
});

// Get Credit Customer Debts/Sales
app.get("/credit-customers/:contact_info/debts", authenticate, async (req, res) => {
  try {
    const phone = req.params.contact_info;
    if (!phone) return res.status(400).json({ error: "Customer phone missing" });
    
    const customer = await pool.query(
      `SELECT id, name, contact_info, customer_type, open_balance, total_purchases 
       FROM credit_customers 
       WHERE contact_info=$1`,
      [phone]
    );
    
    if (!customer.rows.length) {
      return res.status(404).json({ error: "Credit customer not found" });
    }
    
    const customerId = customer.rows[0].id;
    const customerType = customer.rows[0].customer_type;
    
    // Get unsettled sales
    const debts = await pool.query(
      `SELECT id AS sale_id, total_amount, total_cost, total_profit, 
              unsettled_balance, created_at
       FROM sales
       WHERE payment_type='credit' AND credit_customer_id=$1 
             AND is_voided=false AND unsettled_balance > 0
       ORDER BY created_at DESC`,
      [customerId]
    );
    
    // Get payment history
    const payments = await pool.query(
      `SELECT cp.id, cp.amount, cp.sale_id, cp.created_at, s.total_amount
       FROM credit_payments cp
       LEFT JOIN sales s ON s.id = cp.sale_id
       WHERE cp.credit_customer_id = $1
       ORDER BY cp.created_at DESC`,
      [customerId]
    );
    
    res.json({
      customer: customer.rows[0].name,
      phone: customer.rows[0].contact_info,
      customer_type: customerType,
      open_balance: customer.rows[0].open_balance,
      total_purchases: customer.rows[0].total_purchases,
      unsettled_sales: debts.rows,
      payment_history: payments.rows
    });
    
  } catch (e) {
    console.error(e.message);
    res.status(500).json({ error: "Error loading customer debts" });
  }
});

// -----------------------------
// SALES ROUTES
// -----------------------------

// Create Sale (Cash or Credit)
app.post("/sales", authenticate, async (req, res) => {
  const required = [
    "sold_by_email", 
    "branch_name", 
    "payment_type", 
    "customer_name", 
    "customer_phone", 
    "items"
  ];
  
  const err = validateRequiredFields(required, req.body);
  if (err) return res.status(400).json({ error: err });

  const { 
    sold_by_email, 
    branch_name, 
    payment_type, 
    customer_name, 
    customer_phone, 
    items,
    vat_percentage = 0,
    credit_customer_id = null // For selecting existing credit customer
  } = req.body;

  const client = await pool.connect();
  
  try {
    await client.query("BEGIN");

    const user = await getUserByEmail(sold_by_email);
    if (!user) throw new Error("User not found");

    const branch = await getBranchByName(branch_name);
    if (!branch) throw new Error("Branch not found");

    // Authorization check
    if (user.role === "sales" && user.branch_id !== branch.id) {
      throw new Error("You can only make sales in your assigned branch");
    }

    let creditCustomer = null;
    let creditCustomerId = null;

    // Handle credit sales
    if (payment_type.toLowerCase() === "credit") {
      if (credit_customer_id) {
        // Use existing customer
        const existing = await client.query(
          "SELECT * FROM credit_customers WHERE id=$1",
          [credit_customer_id]
        );
        
        if (!existing.rows.length) {
          throw new Error("Selected credit customer not found");
        }
        
        creditCustomer = existing.rows[0];
        creditCustomerId = creditCustomer.id;
      } else {
        // Create new regular credit customer
        const c = await client.query(
          "SELECT * FROM credit_customers WHERE contact_info=$1", 
          [customer_phone]
        );
        
        if (c.rows.length) {
          creditCustomer = c.rows[0];
          creditCustomerId = creditCustomer.id;
        } else {
          const newC = await client.query(
            `INSERT INTO credit_customers 
             (name, contact_info, customer_type, open_balance, total_purchases)
             VALUES ($1, $2, 'regular', 0, 0) 
             RETURNING *`,
            [customer_name, customer_phone]
          );
          creditCustomer = newC.rows[0];
          creditCustomerId = creditCustomer.id;
        }
      }
    }

    let totalAmount = 0;
    let totalCost = 0;
    let upgradeRevenue = 0;
    const laptopItems = [];

    // Process each item
    for (const item of items) {
      const itemErr = validateRequiredFields(["serial_number", "price"], item);
      if (itemErr) throw new Error(itemErr);

      const { serial_number, price, ram_price = 0, storage_price = 0 } = item;

      const s = await client.query(
        "SELECT * FROM serial_numbers WHERE serial_number=$1 AND branch_id=$2",
        [serial_number, branch.id]
      );
      
      if (!s.rows.length) {
        throw new Error(`Serial ${serial_number} not found in branch`);
      }
      
      const laptop = s.rows[0];

      if (!["available", "returned"].includes(laptop.status)) {
        throw new Error(`Serial ${serial_number} is ${laptop.status} and cannot be sold`);
      }

      const laptopPrice = parseFloat(price) || 0;
      const ramUpgrade = parseFloat(ram_price) || 0;
      const storageUpgrade = parseFloat(storage_price) || 0;

      totalAmount += laptopPrice;
      totalCost += parseFloat(laptop.cost_price);

      if (ramUpgrade > 0) upgradeRevenue += ramUpgrade;
      if (storageUpgrade > 0) upgradeRevenue += storageUpgrade;

      laptopItems.push({
        laptop_id: laptop.id,
        product_name: laptop.product_name,
        serial_number: laptop.serial_number,
        price: laptopPrice,
        ram_upgrade: ramUpgrade,
        storage_upgrade: storageUpgrade
      });
    }

    // Calculate VAT
    const subtotal = totalAmount + upgradeRevenue;
    const vatAmount = (parseFloat(vat_percentage) / 100) * subtotal;
    const finalTotal = subtotal + vatAmount;
    const saleProfit = totalAmount - totalCost;

    // Create sale record
    const sale = await client.query(
      `INSERT INTO sales
        (branch_id, sold_by_email, payment_type, customer_name, customer_phone, 
         total_amount, total_cost, total_profit, unsettled_balance, is_credit, 
         credit_customer_id, is_voided, vat_percentage, vat_amount)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, false, $12, $13)
       RETURNING id, created_at`,
      [
        branch.id,
        sold_by_email,
        payment_type.toLowerCase(),
        customer_name,
        customer_phone,
        finalTotal,
        totalCost,
        saleProfit + upgradeRevenue, // Total profit includes upgrades
        payment_type.toLowerCase() === "credit" ? finalTotal : 0,
        payment_type.toLowerCase() === "credit",
        creditCustomerId,
        vat_percentage,
        vatAmount
      ]
    );

    const saleId = sale.rows[0].id;
    const saleDate = sale.rows[0].created_at;

    // Insert sale items and update laptop status
    for (const litem of laptopItems) {
      await client.query(
        `INSERT INTO sale_items 
         (sale_id, serial_number_id, price, ram_upgrade_price, storage_upgrade_price) 
         VALUES ($1, $2, $3, $4, $5)`,
        [saleId, litem.laptop_id, litem.price, litem.ram_upgrade, litem.storage_upgrade]
      );

      await client.query(
        "UPDATE serial_numbers SET status='sold', sale_price=$1 WHERE id=$2",
        [litem.price, litem.laptop_id]
      );
    }

    // Update credit customer balance
    if (creditCustomer) {
      await client.query(
        `UPDATE credit_customers 
         SET open_balance = open_balance + $1, total_purchases = total_purchases + $1 
         WHERE id=$2`,
        [finalTotal, creditCustomerId]
      );
    }

    // Low stock warning check
    let lowStockWarning = null;
    if (items.length > 0) {
      const firstProduct = await client.query(
        "SELECT product_name FROM serial_numbers WHERE serial_number=$1",
        [items[0].serial_number]
      );
      
      if (firstProduct.rows.length) {
        const stockLeft = await client.query(
          `SELECT COUNT(*) AS total 
           FROM serial_numbers 
           WHERE product_name=$1 AND branch_id=$2 AND status IN ('available','returned')`,
          [firstProduct.rows[0].product_name, branch.id]
        );

        const remaining = parseInt(stockLeft.rows[0].total);
        if (remaining <= 5) {
          lowStockWarning = `⚠ LOW STOCK WARNING: Only ${remaining} unit(s) left for ${firstProduct.rows[0].product_name}`;
        }
      }
    }

    await client.query("COMMIT");

    const response = {
      message: "Sale recorded successfully",
      sale_id: saleId,
      subtotal: subtotal,
      vat_amount: vatAmount,
      total: finalTotal,
      cost: totalCost,
      profit: saleProfit + upgradeRevenue,
      receipt_url: payment_type.toLowerCase() === "cash" ? `/receipt/${saleId}` : null
    };

    if (lowStockWarning) {
      response.warning = lowStockWarning;
    }

    res.json(response);

  } catch (e) {
    await client.query("ROLLBACK");
    console.error('Sale error:', e.message);
    res.status(500).json({ error: e.message });
  } finally {
    client.release();
  }
});

// Get Sale Receipt (Cash Sales Only - Public Route)
app.get("/receipt/:sale_id", async (req, res) => {
  try {
    const { sale_id } = req.params;

    const sale = await pool.query(
      `SELECT s.*, b.name AS branch_name
       FROM sales s
       JOIN branches b ON b.id = s.branch_id
       WHERE s.id = $1`,
      [sale_id]
    );

    if (!sale.rows.length) {
      return res.status(404).json({ error: "Sale not found" });
    }

    const saleData = sale.rows[0];

    // Only generate receipt for cash sales
    if (saleData.payment_type !== 'cash') {
      return res.status(400).json({ 
        error: "Receipts are only generated for cash sales" 
      });
    }

    const items = await pool.query(
      `SELECT si.*, sn.product_name, sn.serial_number
       FROM sale_items si
       JOIN serial_numbers sn ON sn.id = si.serial_number_id
       WHERE si.sale_id = $1`,
      [sale_id]
    );

    const receiptData = {
      sale_id: saleData.id,
      date: saleData.created_at,
      customer_name: saleData.customer_name,
      customer_phone: saleData.customer_phone,
      payment_type: saleData.payment_type,
      total_amount: saleData.total_amount,
      vat_percentage: saleData.vat_percentage,
      vat_amount: saleData.vat_amount,
      items: items.rows.map(item => ({
        product_name: item.product_name,
        serial_number: item.serial_number,
        price: item.price,
        ram_upgrade_price: item.ram_upgrade_price,
        storage_upgrade_price: item.storage_upgrade_price
      }))
    };

    generateSaleReceiptPDF(receiptData, res);

  } catch (e) {
    console.error(e.message);
    res.status(500).json({ error: "Error generating receipt" });
  }
});

// Get Sale Details
app.get("/sales/:sale_id", authenticate, async (req, res) => {
  try {
    const { sale_id } = req.params;

    const sale = await pool.query(
      `SELECT s.*, b.name AS branch_name
       FROM sales s
       JOIN branches b ON b.id = s.branch_id
       WHERE s.id = $1`,
      [sale_id]
    );

    if (!sale.rows.length) {
      return res.status(404).json({ error: "Sale not found" });
    }

    const items = await pool.query(
      `SELECT si.*, sn.product_name, sn.serial_number, sn.specifications
       FROM sale_items si
       JOIN serial_numbers sn ON sn.id = si.serial_number_id
       WHERE si.sale_id = $1`,
      [sale_id]
    );

    res.json({
      sale: sale.rows[0],
      items: items.rows
    });

  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});
// -----------------------------
// CREDIT PAYMENT ROUTES
// -----------------------------

// Record Credit Payment
app.post("/credit-payment", authenticate, async (req, res) => {
  const err = validateRequiredFields(["customer_phone", "amount"], req.body);
  if (err) return res.status(400).json({ error: err });

  const { customer_phone, amount, sale_id = null } = req.body;
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // Get customer
    const c = await client.query(
      "SELECT * FROM credit_customers WHERE contact_info=$1", 
      [customer_phone]
    );
    
    if (!c.rows.length) throw new Error("Credit customer not found");

    const customer = c.rows[0];
    const customerId = customer.id;
    const currentBalance = parseFloat(customer.open_balance);
    const paymentAmount = parseFloat(amount);

    // Validate payment amount
    if (paymentAmount <= 0) {
      throw new Error("Payment amount must be greater than zero");
    }

    if (paymentAmount > currentBalance) {
      throw new Error("Payment amount exceeds open balance");
    }

    let saleData = null;
    let laptopName = null;

    // For regular customers, require sale_id
    if (customer.customer_type === 'regular') {
      if (!sale_id) {
        throw new Error("Sale ID is required for regular credit customers");
      }

      // Verify sale exists and belongs to customer
      const saleCheck = await client.query(
        `SELECT s.*, 
                (SELECT sn.product_name FROM sale_items si 
                 JOIN serial_numbers sn ON sn.id = si.serial_number_id 
                 WHERE si.sale_id = s.id LIMIT 1) AS laptop_name
         FROM sales s
         WHERE s.id=$1 AND s.credit_customer_id=$2 AND s.is_voided=false`,
        [sale_id, customerId]
      );

      if (!saleCheck.rows.length) {
        throw new Error("Sale not found or does not belong to this customer");
      }

      saleData = saleCheck.rows[0];
      laptopName = saleData.laptop_name;

      // Update sale unsettled balance
      const newUnsettledBalance = Math.max(0, parseFloat(saleData.unsettled_balance) - paymentAmount);
      
      await client.query(
        "UPDATE sales SET unsettled_balance=$1 WHERE id=$2",
        [newUnsettledBalance, sale_id]
      );
    }

    // Record payment
    const payment = await client.query(
      `INSERT INTO credit_payments (credit_customer_id, amount, sale_id, payment_type) 
       VALUES ($1, $2, $3, $4)
       RETURNING id, created_at`,
      [customerId, paymentAmount, sale_id, currentBalance - paymentAmount === 0 ? 'full' : 'partial']
    );

    const paymentId = payment.rows[0].id;
    const paymentDate = payment.rows[0].created_at;

    // Update customer balance (auto-clamp at 0)
    const newBalance = Math.max(0, currentBalance - paymentAmount);

    await client.query(
      "UPDATE credit_customers SET open_balance=$1 WHERE id=$2", 
      [newBalance, customerId]
    );

    // Calculate total paid for this sale (for regular customers)
    let totalPaidForSale = paymentAmount;
    if (customer.customer_type === 'regular' && sale_id && saleData) {
      const paymentsResult = await client.query(
        "SELECT SUM(amount) as total FROM credit_payments WHERE sale_id=$1",
        [sale_id]
      );
      totalPaidForSale = parseFloat(paymentsResult.rows[0].total) || 0;
    }

    await client.query("COMMIT");

    res.json({ 
      message: "Credit payment recorded successfully", 
      payment_id: paymentId,
      amount_paid: paymentAmount,
      open_balance: newBalance,
      receipt_url: `/credit-payment-receipt/${paymentId}`
    });

  } catch(e) {
    await client.query("ROLLBACK");
    console.error('Payment error:', e.message);
    res.status(500).json({ error: e.message });
  } finally {
    client.release();
  }
});

// Get Credit Payment Receipt
app.get("/credit-payment-receipt/:payment_id", async (req, res) => {
  try {
    const { payment_id } = req.params;

    const payment = await pool.query(
      `SELECT cp.*, cc.name AS customer_name, cc.contact_info AS customer_phone,
              cc.customer_type, cc.open_balance
       FROM credit_payments cp
       JOIN credit_customers cc ON cc.id = cp.credit_customer_id
       WHERE cp.id = $1`,
      [payment_id]
    );

    if (!payment.rows.length) {
      return res.status(404).json({ error: "Payment not found" });
    }

    const paymentData = payment.rows[0];
    let laptopName = null;
    let saleDate = null;
    let totalPaid = parseFloat(paymentData.amount);

    // For regular customers with sale_id, get sale details
    if (paymentData.customer_type === 'regular' && paymentData.sale_id) {
      const saleInfo = await pool.query(
        `SELECT s.created_at,
                (SELECT sn.product_name FROM sale_items si 
                 JOIN serial_numbers sn ON sn.id = si.serial_number_id 
                 WHERE si.sale_id = s.id LIMIT 1) AS laptop_name
         FROM sales s
         WHERE s.id = $1`,
        [paymentData.sale_id]
      );

      if (saleInfo.rows.length) {
        laptopName = saleInfo.rows[0].laptop_name;
        saleDate = saleInfo.rows[0].created_at;
      }

      // Get total paid for this sale
      const totalPaidResult = await pool.query(
        "SELECT SUM(amount) as total FROM credit_payments WHERE sale_id=$1",
        [paymentData.sale_id]
      );
      totalPaid = parseFloat(totalPaidResult.rows[0].total) || 0;
    }

    const receiptData = {
      payment_id: paymentData.id,
      customer_name: paymentData.customer_name,
      customer_phone: paymentData.customer_phone,
      customer_type: paymentData.customer_type,
      amount_paid: paymentData.amount,
      payment_date: paymentData.created_at,
      balance_remaining: paymentData.open_balance,
      sale_id: paymentData.sale_id,
      laptop_name: laptopName,
      sale_date: saleDate,
      total_paid: totalPaid
    };

    generateCreditPaymentReceiptPDF(receiptData, res);

  } catch (e) {
    console.error(e.message);
    res.status(500).json({ error: "Error generating payment receipt" });
  }
});

// -----------------------------
// RETURN ROUTES
// -----------------------------

// Cash Return
app.post("/cash-return", authenticate, async (req, res) => {
  const { serial_number, sale_id } = req.body;
  const required = ["serial_number", "sale_id"];
  const err = validateRequiredFields(required, req.body);
  if (err) return res.status(400).json({ error: err });

  const client = await pool.connect();
  
  try {
    await client.query("BEGIN");

    // Get the sale item details
    const saleItemRes = await client.query(
      `SELECT si.*, sn.cost_price, sn.id as laptop_id, s.payment_type
       FROM sale_items si
       JOIN serial_numbers sn ON sn.id = si.serial_number_id
       JOIN sales s ON s.id = si.sale_id
       WHERE sn.serial_number = $1 AND si.sale_id = $2`,
      [serial_number, sale_id]
    );

    if (!saleItemRes.rows.length) {
      throw new Error("Sale item not found");
    }

    const saleItem = saleItemRes.rows[0];
    
    // Verify it's a cash sale
    if (saleItem.payment_type !== 'cash') {
      throw new Error("Use credit-return endpoint for credit sales");
    }
    
    // Calculate amounts to reverse
    const itemPrice = parseFloat(saleItem.price);
    const ramUpgrade = parseFloat(saleItem.ram_upgrade_price) || 0;
    const storageUpgrade = parseFloat(saleItem.storage_upgrade_price) || 0;
    const totalItemAmount = itemPrice + ramUpgrade + storageUpgrade;
    
    const costPrice = parseFloat(saleItem.cost_price);
    const profitToReverse = itemPrice - costPrice;

    // Get the sale to update totals
    const saleRes = await client.query("SELECT * FROM sales WHERE id = $1", [sale_id]);
    if (!saleRes.rows.length) {
      throw new Error("Sale not found");
    }

    const sale = saleRes.rows[0];

    // Calculate new sale totals
    const newTotalAmount = parseFloat(sale.total_amount) - totalItemAmount;
    const newTotalCost = parseFloat(sale.total_cost) - costPrice;
    const newTotalProfit = parseFloat(sale.total_profit) - (profitToReverse + ramUpgrade + storageUpgrade);

    await client.query(
      `UPDATE sales 
       SET total_amount = $1, total_cost = $2, total_profit = $3 
       WHERE id = $4`,
      [newTotalAmount, newTotalCost, newTotalProfit, sale_id]
    );

    // Mark the serial number as returned
    await client.query(
      "UPDATE serial_numbers SET status = 'returned', sale_price = NULL WHERE id = $1",
      [saleItem.laptop_id]
    );

    // Delete the sale item
    await client.query("DELETE FROM sale_items WHERE id = $1", [saleItem.id]);

    await client.query("COMMIT");
    res.json({ message: "Cash return processed successfully" });
  } catch (e) {
    await client.query("ROLLBACK");
    console.error('Return error:', e.message);
    res.status(500).json({ error: e.message });
  } finally {
    client.release();
  }
});

// Credit Return
app.post("/credit-return", authenticate, async (req, res) => {
  const { serial_number, sale_id, customer_phone } = req.body;
  const required = ["serial_number", "sale_id", "customer_phone"];
  const err = validateRequiredFields(required, req.body);
  if (err) return res.status(400).json({ error: err });

  const client = await pool.connect();
  
  try {
    await client.query("BEGIN");

    // Get the sale item details
    const saleItemRes = await client.query(
      `SELECT si.*, sn.cost_price, sn.id as laptop_id, s.payment_type, s.credit_customer_id
       FROM sale_items si
       JOIN serial_numbers sn ON sn.id = si.serial_number_id
       JOIN sales s ON s.id = si.sale_id
       WHERE sn.serial_number = $1 AND si.sale_id = $2`,
      [serial_number, sale_id]
    );

    if (!saleItemRes.rows.length) {
      throw new Error("Sale item not found");
    }

    const saleItem = saleItemRes.rows[0];
    
    // Verify it's a credit sale
    if (saleItem.payment_type !== 'credit') {
      throw new Error("Use cash-return endpoint for cash sales");
    }
    
    // Calculate amounts to reverse
    const itemPrice = parseFloat(saleItem.price);
    const ramUpgrade = parseFloat(saleItem.ram_upgrade_price) || 0;
    const storageUpgrade = parseFloat(saleItem.storage_upgrade_price) || 0;
    const totalItemAmount = itemPrice + ramUpgrade + storageUpgrade;
    
    const costPrice = parseFloat(saleItem.cost_price);
    const profitToReverse = itemPrice - costPrice;

    // Get the sale to update totals
    const saleRes = await client.query("SELECT * FROM sales WHERE id = $1", [sale_id]);
    if (!saleRes.rows.length) {
      throw new Error("Sale not found");
    }

    const sale = saleRes.rows[0];

    // Calculate new sale totals
    const newTotalAmount = parseFloat(sale.total_amount) - totalItemAmount;
    const newTotalCost = parseFloat(sale.total_cost) - costPrice;
    const newTotalProfit = parseFloat(sale.total_profit) - (profitToReverse + ramUpgrade + storageUpgrade);
    const newUnsettledBalance = Math.max(0, parseFloat(sale.unsettled_balance) - totalItemAmount);

    await client.query(
      `UPDATE sales 
       SET total_amount = $1, total_cost = $2, total_profit = $3, unsettled_balance = $4 
       WHERE id = $5`,
      [newTotalAmount, newTotalCost, newTotalProfit, newUnsettledBalance, sale_id]
    );

    // Update credit customer balance (auto-clamp at 0)
    const customer = await client.query(
      "SELECT * FROM credit_customers WHERE contact_info = $1",
      [customer_phone]
    );

    if (customer.rows.length) {
      const newOpenBalance = Math.max(0, parseFloat(customer.rows[0].open_balance) - totalItemAmount);
      const newTotalPurchases = Math.max(0, parseFloat(customer.rows[0].total_purchases) - totalItemAmount);

      await client.query(
        "UPDATE credit_customers SET open_balance = $1, total_purchases = $2 WHERE id = $3",
        [newOpenBalance, newTotalPurchases, customer.rows[0].id]
      );
    }

    // Mark the serial number as returned
    await client.query(
      "UPDATE serial_numbers SET status = 'returned', sale_price = NULL WHERE id = $1",
      [saleItem.laptop_id]
    );

    // Delete the sale item
    await client.query("DELETE FROM sale_items WHERE id = $1", [saleItem.id]);

    await client.query("COMMIT");
    res.json({ message: "Credit return processed successfully" });
  } catch (e) {
    await client.query("ROLLBACK");
    console.error('Return error:', e.message);
    res.status(500).json({ error: e.message });
  } finally {
    client.release();
  }
});

// -----------------------------
// REPORT ROUTES
// -----------------------------

// Daily Report
app.get("/reports/daily", authenticate, async (req, res) => {
  try {
    if (req.user.role === "sales") {
      const result = await pool.query(
        `SELECT s.id AS sale_id,
                DATE(s.created_at) AS sale_date,
                sn.product_name,
                sn.serial_number,
                sn.cost_price,
                si.price AS sale_price,
                si.ram_upgrade_price,
                si.storage_upgrade_price,
                s.sold_by_email,
                (si.price - sn.cost_price + COALESCE(si.ram_upgrade_price, 0) + COALESCE(si.storage_upgrade_price, 0)) AS profit
         FROM sales s
         JOIN sale_items si ON si.sale_id = s.id
         JOIN serial_numbers sn ON sn.id = si.serial_number_id
         WHERE DATE(s.created_at) = CURRENT_DATE
         AND s.branch_id = $1
         AND s.is_voided = false
         ORDER BY s.created_at DESC`,
        [req.user.branch_id]
      );

      const totals = result.rows.reduce(
        (acc, row) => {
          acc.total_cost += Number(row.cost_price);
          acc.total_revenue += Number(row.sale_price) + Number(row.ram_upgrade_price || 0) + Number(row.storage_upgrade_price || 0);
          acc.total_profit += Number(row.profit);
          return acc;
        },
        { total_cost: 0, total_revenue: 0, total_profit: 0 }
      );

      return res.json({ report_type: "DAILY", branch: req.user.branch_id, sales: result.rows, totals });
    }

    if (req.query.branch_name) {
      const branch = await getBranchByName(req.query.branch_name);
      if (!branch) return res.status(400).json({ error: "Branch not found" });

      const result = await pool.query(
        `SELECT s.id AS sale_id,
                DATE(s.created_at) AS sale_date,
                sn.product_name,
                sn.serial_number,
                sn.cost_price,
                si.price AS sale_price,
                si.ram_upgrade_price,
                si.storage_upgrade_price,
                s.sold_by_email,
                (si.price - sn.cost_price + COALESCE(si.ram_upgrade_price, 0) + COALESCE(si.storage_upgrade_price, 0)) AS profit
         FROM sales s
         JOIN sale_items si ON si.sale_id = s.id
         JOIN serial_numbers sn ON sn.id = si.serial_number_id
         WHERE DATE(s.created_at) = CURRENT_DATE
         AND s.branch_id = $1
         AND s.is_voided = false
         ORDER BY s.created_at DESC`,
        [branch.id]
      );

      const totals = result.rows.reduce(
        (acc, row) => {
          acc.total_cost += Number(row.cost_price);
          acc.total_revenue += Number(row.sale_price) + Number(row.ram_upgrade_price || 0) + Number(row.storage_upgrade_price || 0);
          acc.total_profit += Number(row.profit);
          return acc;
        },
        { total_cost: 0, total_revenue: 0, total_profit: 0 }
      );

      return res.json({ report_type: "DAILY", branch: branch.id, branch_name: branch.name, sales: result.rows, totals });
    }

    const result = await pool.query(
      `SELECT s.id AS sale_id,
              DATE(s.created_at) AS sale_date,
              sn.product_name,
              sn.serial_number,
              sn.cost_price,
              si.price AS sale_price,
              si.ram_upgrade_price,
              si.storage_upgrade_price,
              s.sold_by_email,
              s.branch_id,
              b.name AS branch_name,
              (si.price - sn.cost_price + COALESCE(si.ram_upgrade_price, 0) + COALESCE(si.storage_upgrade_price, 0)) AS profit
       FROM sales s
       JOIN sale_items si ON si.sale_id = s.id
       JOIN serial_numbers sn ON sn.id = si.serial_number_id
       JOIN branches b ON b.id = s.branch_id
       WHERE DATE(s.created_at) = CURRENT_DATE
       AND s.is_voided = false
       ORDER BY b.name, s.created_at DESC`
    );

    const branchTotals = {};
    result.rows.forEach(row => {
      if (!branchTotals[row.branch_name]) {
        branchTotals[row.branch_name] = {
          branch_id: row.branch_id,
          branch_name: row.branch_name,
          total_cost: 0,
          total_revenue: 0,
          total_profit: 0,
          sales: []
        };
      }
      const revenue = Number(row.sale_price) + Number(row.ram_upgrade_price || 0) + Number(row.storage_upgrade_price || 0);
      branchTotals[row.branch_name].total_cost += Number(row.cost_price);
      branchTotals[row.branch_name].total_revenue += revenue;
      branchTotals[row.branch_name].total_profit += Number(row.profit);
      branchTotals[row.branch_name].sales.push(row);
    });

    const grandTotals = Object.values(branchTotals).reduce(
      (acc, branch) => {
        acc.total_cost += branch.total_cost;
        acc.total_revenue += branch.total_revenue;
        acc.total_profit += branch.total_profit;
        return acc;
      },
      { total_cost: 0, total_revenue: 0, total_profit: 0 }
    );

    res.json({ 
      report_type: "DAILY", 
      branches: Object.values(branchTotals),
      grand_totals: grandTotals
    });

  } catch (e) {
    console.error(e.message);
    res.status(500).json({ error: "Error loading daily report" });
  }
});

// Weekly Report
app.get("/reports/weekly", authenticate, async (req, res) => {
  try {
    const baseQuery = `
      SELECT s.id AS sale_id,
             DATE(s.created_at) AS sale_date,
             sn.product_name,
             sn.serial_number,
             sn.cost_price,
             si.price AS sale_price,
             si.ram_upgrade_price,
             si.storage_upgrade_price,
             s.sold_by_email,
             (si.price - sn.cost_price + COALESCE(si.ram_upgrade_price, 0) + COALESCE(si.storage_upgrade_price, 0)) AS profit
      FROM sales s
      JOIN sale_items si ON si.sale_id = s.id
      JOIN serial_numbers sn ON sn.id = si.serial_number_id
      WHERE s.created_at >= CURRENT_DATE - INTERVAL '7 days'
      AND s.is_voided = false
    `;

    if (req.user.role === "sales") {
      const result = await pool.query(
        baseQuery + " AND s.branch_id = $1 ORDER BY s.created_at DESC",
        [req.user.branch_id]
      );

      const totals = result.rows.reduce(
        (acc, row) => {
          acc.total_cost += Number(row.cost_price);
          acc.total_revenue += Number(row.sale_price) + Number(row.ram_upgrade_price || 0) + Number(row.storage_upgrade_price || 0);
          acc.total_profit += Number(row.profit);
          return acc;
        },
        { total_cost: 0, total_revenue: 0, total_profit: 0 }
      );

      return res.json({ report_type: "WEEKLY", branch: req.user.branch_id, sales: result.rows, totals });
    }

    if (req.query.branch_name) {
      const branch = await getBranchByName(req.query.branch_name);
      if (!branch) return res.status(400).json({ error: "Branch not found" });

      const result = await pool.query(
        baseQuery + " AND s.branch_id = $1 ORDER BY s.created_at DESC",
        [branch.id]
      );

      const totals = result.rows.reduce(
        (acc, row) => {
          acc.total_cost += Number(row.cost_price);
          acc.total_revenue += Number(row.sale_price) + Number(row.ram_upgrade_price || 0) + Number(row.storage_upgrade_price || 0);
          acc.total_profit += Number(row.profit);
          return acc;
        },
        { total_cost: 0, total_revenue: 0, total_profit: 0 }
      );

      return res.json({ report_type: "WEEKLY", branch: branch.id, branch_name: branch.name, sales: result.rows, totals });
    }

    const result = await pool.query(
      `SELECT s.id AS sale_id,
              DATE(s.created_at) AS sale_date,
              sn.product_name,
              sn.serial_number,
              sn.cost_price,
              si.price AS sale_price,
              si.ram_upgrade_price,
              si.storage_upgrade_price,
              s.sold_by_email,
              s.branch_id,
              b.name AS branch_name,
              (si.price - sn.cost_price + COALESCE(si.ram_upgrade_price, 0) + COALESCE(si.storage_upgrade_price, 0)) AS profit
       FROM sales s
       JOIN sale_items si ON si.sale_id = s.id
       JOIN serial_numbers sn ON sn.id = si.serial_number_id
       JOIN branches b ON b.id = s.branch_id
       WHERE s.created_at >= CURRENT_DATE - INTERVAL '7 days'
       AND s.is_voided = false
       ORDER BY b.name, s.created_at DESC`
    );

    const branchTotals = {};
    result.rows.forEach(row => {
      if (!branchTotals[row.branch_name]) {
        branchTotals[row.branch_name] = {
          branch_id: row.branch_id,
          branch_name: row.branch_name,
          total_cost: 0,
          total_revenue: 0,
          total_profit: 0,
          sales: []
        };
      }
      const revenue = Number(row.sale_price) + Number(row.ram_upgrade_price || 0) + Number(row.storage_upgrade_price || 0);
      branchTotals[row.branch_name].total_cost += Number(row.cost_price);
      branchTotals[row.branch_name].total_revenue += revenue;
      branchTotals[row.branch_name].total_profit += Number(row.profit);
      branchTotals[row.branch_name].sales.push(row);
    });

    const grandTotals = Object.values(branchTotals).reduce(
      (acc, branch) => {
        acc.total_cost += branch.total_cost;
        acc.total_revenue += branch.total_revenue;
        acc.total_profit += branch.total_profit;
        return acc;
      },
      { total_cost: 0, total_revenue: 0, total_profit: 0 }
    );

    res.json({ 
      report_type: "WEEKLY", 
      branches: Object.values(branchTotals),
      grand_totals: grandTotals
    });

  } catch (e) {
    console.error(e.message);
    res.status(500).json({ error: "Error loading weekly report" });
  }
});

// Monthly Report
app.get("/reports/monthly", authenticate, async (req, res) => {
  try {
    const err = validateRequiredFields(["month", "year"], req.query);
    if (err) return res.status(400).json({ error: err });

    const { month, year, branch_name } = req.query;

    let branch_id = null;
    if (branch_name && req.user.role === "admin") {
      const b = await getBranchByName(branch_name);
      if (!b) return res.status(400).json({ error: "Branch not found" });
      branch_id = b.id;
    }
    if (req.user.role === "sales") branch_id = req.user.branch_id;
    if (!branch_id) return res.status(400).json({ error: "Branch required" });

    const result = await pool.query(
      `SELECT s.id AS sale_id,
              DATE(s.created_at) AS sale_date,
              sn.product_name,
              sn.serial_number,
              sn.cost_price,
              si.price AS sale_price,
              si.ram_upgrade_price,
              si.storage_upgrade_price,
              s.sold_by_email,
              (si.price - sn.cost_price + COALESCE(si.ram_upgrade_price, 0) + COALESCE(si.storage_upgrade_price, 0)) AS profit
       FROM sales s
       JOIN sale_items si ON si.sale_id = s.id
       JOIN serial_numbers sn ON sn.id = si.serial_number_id
       WHERE EXTRACT(MONTH FROM s.created_at) = $1
         AND EXTRACT(YEAR FROM s.created_at) = $2
         AND s.branch_id = $3
         AND s.is_voided = false
       ORDER BY s.created_at DESC`,
      [month, year, branch_id]
    );

    const totals = result.rows.reduce(
      (acc, row) => {
        acc.total_cost += Number(row.cost_price);
        acc.total_revenue += Number(row.sale_price) + Number(row.ram_upgrade_price || 0) + Number(row.storage_upgrade_price || 0);
        acc.total_profit += Number(row.profit);
        return acc;
      },
      { total_cost: 0, total_revenue: 0, total_profit: 0 }
    );

    res.json({ report_type: "MONTHLY", branch: branch_id, sales: result.rows, totals });

  } catch (e) {
    console.error(e.message);
    res.status(500).json({ error: "Error loading monthly report" });
  }
});

// Yearly Report
app.get("/reports/yearly", authenticate, async (req, res) => {
  try {
    const err = validateRequiredFields(["year"], req.query);
    if (err) return res.status(400).json({ error: err });

    const { year, branch_name } = req.query;

    let branch_id = null;
    if (branch_name && req.user.role === "admin") {
      const b = await getBranchByName(branch_name);
      if (!b) return res.status(400).json({ error: "Branch not found" });
      branch_id = b.id;
    }
    if (req.user.role === "sales") branch_id = req.user.branch_id;
    if (!branch_id) return res.status(400).json({ error: "Branch required" });

    const result = await pool.query(
      `SELECT s.id AS sale_id,
              DATE(s.created_at) AS sale_date,
              sn.product_name,
              sn.serial_number,
              sn.cost_price,
              si.price AS sale_price,
              si.ram_upgrade_price,
              si.storage_upgrade_price,
              s.sold_by_email,
              (si.price - sn.cost_price + COALESCE(si.ram_upgrade_price, 0) + COALESCE(si.storage_upgrade_price, 0)) AS profit
       FROM sales s
       JOIN sale_items si ON si.sale_id = s.id
       JOIN serial_numbers sn ON sn.id = si.serial_number_id
       WHERE EXTRACT(YEAR FROM s.created_at) = $1
         AND s.branch_id = $2
         AND s.is_voided = false
       ORDER BY s.created_at DESC`,
      [year, branch_id]
    );

    const totals = result.rows.reduce(
      (acc, row) => {
        acc.total_cost += Number(row.cost_price);
        acc.total_revenue += Number(row.sale_price) + Number(row.ram_upgrade_price || 0) + Number(row.storage_upgrade_price || 0);
        acc.total_profit += Number(row.profit);
        return acc;
      },
      { total_cost: 0, total_revenue: 0, total_profit: 0 }
    );

    res.json({ report_type: "YEARLY", branch: branch_id, sales: result.rows, totals });

  } catch (e) {
    console.error(e.message);
    res.status(500).json({ error: "Error loading yearly report" });
  }
});

// Custom Date Range Report
app.get("/reports/custom", authenticate, async (req, res) => {
  try {
    const err = validateRequiredFields(["start_date", "end_date"], req.query);
    if (err) return res.status(400).json({ error: err });

    const { start_date, end_date, branch_name } = req.query;

    let branch_id = null;
    if (branch_name && req.user.role === "admin") {
      const b = await getBranchByName(branch_name);
      if (!b) return res.status(400).json({ error: "Branch not found" });
      branch_id = b.id;
    }
    if (req.user.role === "sales") branch_id = req.user.branch_id;
    if (!branch_id) return res.status(400).json({ error: "Branch required" });

    const result = await pool.query(
      `SELECT s.id AS sale_id,
              DATE(s.created_at) AS sale_date,
              sn.product_name,
              sn.serial_number,
              sn.cost_price,
              si.price AS sale_price,
              si.ram_upgrade_price,
              si.storage_upgrade_price,
              s.sold_by_email,
              (si.price - sn.cost_price + COALESCE(si.ram_upgrade_price, 0) + COALESCE(si.storage_upgrade_price, 0)) AS profit
       FROM sales s
       JOIN sale_items si ON si.sale_id = s.id
       JOIN serial_numbers sn ON sn.id = si.serial_number_id
       WHERE DATE(s.created_at) >= $1
         AND DATE(s.created_at) <= $2
         AND s.branch_id = $3
         AND s.is_voided = false
       ORDER BY s.created_at DESC`,
      [start_date, end_date, branch_id]
    );

    const totals = result.rows.reduce(
      (acc, row) => {
        acc.total_cost += Number(row.cost_price);
        acc.total_revenue += Number(row.sale_price) + Number(row.ram_upgrade_price || 0) + Number(row.storage_upgrade_price || 0);
        acc.total_profit += Number(row.profit);
        return acc;
      },
      { total_cost: 0, total_revenue: 0, total_profit: 0 }
    );

    res.json({ 
      report_type: "CUSTOM_RANGE", 
      start_date, 
      end_date, 
      branch: branch_id, 
      sales: result.rows, 
      totals 
    });

  } catch (e) {
    console.error(e.message);
    res.status(500).json({ error: "Error loading custom report" });
  }
});

// -----------------------------
// SEARCH ROUTE
// -----------------------------
app.get("/search", authenticate, async (req, res) => {
  try {
    const { q } = req.query;
    if (!q || q.trim() === "") {
      return res.status(400).json({ error: "Search query required" });
    }

    const searchTerm = `%${q}%`;
    const results = {
      laptops: [],
      customers: [],
      branches: [],
      suppliers: []
    };

    let laptopQuery = `SELECT DISTINCT product_name FROM serial_numbers WHERE product_name ILIKE $1`;
    const laptopParams = [searchTerm];

    if (req.user.role === "sales") {
      laptopQuery += " AND branch_id=$2";
      laptopParams.push(req.user.branch_id);
    }

    laptopQuery += " LIMIT 10";
    const laptops = await pool.query(laptopQuery, laptopParams);
    results.laptops = laptops.rows.map(r => r.product_name);

    if (req.user.role === "admin") {
      const customers = await pool.query(
        "SELECT name, contact_info FROM credit_customers WHERE name ILIKE $1 OR contact_info ILIKE $1 LIMIT 10",
        [searchTerm]
      );
      results.customers = customers.rows;

      const branches = await pool.query(
        "SELECT name FROM branches WHERE name ILIKE $1 LIMIT 10",
        [searchTerm]
      );
      results.branches = branches.rows.map(r => r.name);

      const suppliers = await pool.query(
        "SELECT name FROM suppliers WHERE name ILIKE $1 LIMIT 10",
        [searchTerm]
      );
      results.suppliers = suppliers.rows.map(r => r.name);
    }

    res.json(results);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// -----------------------------
// ROOT ROUTE
// -----------------------------
app.get("/", async (req, res) => {
  try {
    const r = await pool.query("SELECT NOW()");
    res.send(`✅ JIMAS COMPUTERS API is LIVE! Database time: ${r.rows[0].now}`);
  } catch (err) {
    console.error("Database connection error:", err.message);
    res.send("⚠️ Server is live but database is NOT connected");
  }
});

// -----------------------------
// START SERVER
// -----------------------------
app.listen(PORT, () => {
  console.log(`
  ========================================
  🚀 JIMAS COMPUTERS API SERVER RUNNING
  ========================================
  📡 Port: ${PORT}
  🗄️  Database: ${process.env.DATABASE_URL ? 'Connected' : 'Not configured'}
  🕐 Started: ${new Date().toLocaleString()}
  ========================================
  `);
});