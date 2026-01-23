// =============================================================================
// JIMAS COMPUTERS NIGERIA LIMITED - INVENTORY & POS SYSTEM
// Complete Backend API - UPDATED WITH NEW FEATURES
// =============================================================================

// -----------------------------
// IMPORTS
// -----------------------------
const express = require("express");
const { Pool } = require("pg");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const bodyParser = require("body-parser");
const cors = require("cors");
const PDFDocument = require("pdfkit");

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
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || "postgresql://jimas_db_ldts_user:mngwWQoTAZtzVqQax0jJHtfSUscUSGkm@dpg-d5fc1qn5r7bs73ansc5g-a.frankfurt-postgres.render.com/jimas_db_ldts",
  ssl: { rejectUnauthorized: false }
});

// -----------------------------
// JWT SECRET
// -----------------------------
const JWT_SECRET = process.env.JWT_SECRET || "jimas-super-secret-key-2024";

// -----------------------------
// VALIDATION HELPER
// -----------------------------
function validateRequiredFields(required, body) {
  const missing = required.filter(
    (f) => !(f in body) || body[f] === "" || body[f] === null || body[f] === undefined
  );
  return missing.length ? `Missing fields: ${missing.join(", ")}` : null;
}

// -----------------------------
// AUTH MIDDLEWARE
// -----------------------------
function authenticate(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth) return res.status(401).json({ error: "Invalid or missing token" });

  try {
    const decoded = jwt.verify(auth.split(" ")[1], JWT_SECRET);
    req.user = decoded;
    next();
  } catch {
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
// LOOKUP HELPERS
// -----------------------------
async function getUserByEmail(email) {
  const r = await pool.query("SELECT * FROM users WHERE email = $1", [email]);
  return r.rows[0] || null;
}

async function getBranchByName(name) {
  const r = await pool.query("SELECT * FROM branches WHERE name = $1", [name]);
  return r.rows[0] || null;
}

async function getBranchById(id) {
  const r = await pool.query("SELECT * FROM branches WHERE id = $1", [id]);
  return r.rows[0] || null;
}

async function getSupplierByName(name) {
  const r = await pool.query("SELECT * FROM suppliers WHERE name = $1", [name]);
  return r.rows[0] || null;
}

async function getSupplierById(id) {
  const r = await pool.query("SELECT * FROM suppliers WHERE id = $1", [id]);
  return r.rows[0] || null;
}

// =============================================================================
// RECEIPT GENERATOR HELPERS - UPDATED WITH SPECIFICATIONS
// =============================================================================

// Cash Sale Receipt - NOW INCLUDES SPECIFICATIONS
function generateCashSaleReceipt(saleData, res) {
  const doc = new PDFDocument({
    size: [226.77, 700],
    margins: { top: 10, bottom: 10, left: 10, right: 10 }
  });

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `inline; filename=receipt_${saleData.sale_id}.pdf`);

  doc.pipe(res);

  // Business Header
  doc.fontSize(14).font("Helvetica-Bold").text("JIMAS COMPUTERS", { align: "center" });
  doc.fontSize(14).font("Helvetica-Bold").text("NIGERIA LIMITED", { align: "center" });
  doc.moveDown(0.3);
  doc.fontSize(7).font("Helvetica").text("No. 9 Medical Road, Opposite Zenith Bank,", { align: "center" });
  doc.text("Computer Village, Ikeja, Lagos.", { align: "center" });
  doc.moveDown(0.5);

  // Receipt Type
  doc.fontSize(10).font("Helvetica-Bold").text("CASH SALE RECEIPT", { align: "center" });
  doc.moveDown(0.3);
  doc.fontSize(8).text("----------------------------------------", { align: "center" });

  // Sale Details
  doc.fontSize(8).font("Helvetica").text(`Date: ${new Date(saleData.date).toLocaleString()}`, { align: "left" });
  doc.text(`Receipt No: ${saleData.sale_id}`, { align: "left" });
  doc.moveDown(0.3);

  // Customer Info
  doc.fontSize(8).font("Helvetica-Bold").text("CUSTOMER:", { align: "left" });
  doc.fontSize(8).font("Helvetica").text(`Name: ${saleData.customer_name}`, { align: "left" });
  doc.text(`Phone: ${saleData.customer_phone}`, { align: "left" });
  doc.moveDown(0.3);
  doc.fontSize(8).text("----------------------------------------", { align: "center" });

  // Items
  doc.fontSize(8).font("Helvetica-Bold").text("ITEMS:", { align: "left" });
  doc.moveDown(0.2);

  let subtotal = 0;
  saleData.items.forEach((item, index) => {
    const itemTotal = parseFloat(item.price) + parseFloat(item.ram_upgrade_price || 0) + parseFloat(item.storage_upgrade_price || 0);
    subtotal += itemTotal;

    doc.fontSize(7).font("Helvetica-Bold").text(`${index + 1}. ${item.product_name}`, { align: "left" });
    doc.fontSize(6).font("Helvetica").text(`   S/N: ${item.serial_number}`, { align: "left" });
    
    // ADD SPECIFICATIONS TO RECEIPT
    if (item.specifications) {
      doc.fontSize(6).font("Helvetica").text(`   Specs: ${item.specifications}`, { align: "left" });
    }
    
    doc.fontSize(7).font("Helvetica").text(`   Price: NGN ${parseFloat(item.price).toLocaleString()}`, { align: "left" });

    if (item.ram_upgrade_price && parseFloat(item.ram_upgrade_price) > 0) {
      doc.text(`   RAM Upgrade: NGN ${parseFloat(item.ram_upgrade_price).toLocaleString()}`, { align: "left" });
    }
    if (item.storage_upgrade_price && parseFloat(item.storage_upgrade_price) > 0) {
      doc.text(`   Storage Upgrade: NGN ${parseFloat(item.storage_upgrade_price).toLocaleString()}`, { align: "left" });
    }
    doc.moveDown(0.2);
  });

  doc.fontSize(8).text("----------------------------------------", { align: "center" });

  // Sales Note (if exists)
  if (saleData.sales_note) {
    doc.fontSize(7).font("Helvetica-Bold").text("NOTE:", { align: "left" });
    doc.fontSize(7).font("Helvetica").text(saleData.sales_note, { align: "left" });
    doc.moveDown(0.3);
    doc.fontSize(8).text("----------------------------------------", { align: "center" });
  }

  // Totals
  doc.fontSize(8).font("Helvetica").text(`Subtotal: NGN ${subtotal.toLocaleString()}`, { align: "right" });

  if (saleData.vat_percentage && parseFloat(saleData.vat_percentage) > 0) {
    const vatAmount = (subtotal * parseFloat(saleData.vat_percentage)) / 100;
    doc.text(`VAT (${saleData.vat_percentage}%): NGN ${vatAmount.toLocaleString()}`, { align: "right" });
  }

  doc.fontSize(10).font("Helvetica-Bold").text(`TOTAL: NGN ${parseFloat(saleData.total_amount).toLocaleString()}`, { align: "right" });
  doc.moveDown(0.5);

  // Footer
  doc.fontSize(7).font("Helvetica-Oblique").text("Thank you for your patronage!", { align: "center" });
  doc.text("Please keep this receipt for warranty claims.", { align: "center" });

  doc.end();
}

// Credit Payment Receipt - NOW INCLUDES SPECIFICATIONS
function generateCreditPaymentReceipt(paymentData, res) {
  const doc = new PDFDocument({
    size: [226.77, 600],
    margins: { top: 10, bottom: 10, left: 10, right: 10 }
  });

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `inline; filename=payment_receipt_${paymentData.payment_id}.pdf`);

  doc.pipe(res);

  // Business Header
  doc.fontSize(14).font("Helvetica-Bold").text("JIMAS COMPUTERS", { align: "center" });
  doc.fontSize(14).font("Helvetica-Bold").text("NIGERIA LIMITED", { align: "center" });
  doc.moveDown(0.3);
  doc.fontSize(7).font("Helvetica").text("No. 9 Medical Road, Opposite Zenith Bank,", { align: "center" });
  doc.text("Computer Village, Ikeja, Lagos.", { align: "center" });
  doc.moveDown(0.5);

  // Receipt Type
  doc.fontSize(10).font("Helvetica-Bold").text("CREDIT PAYMENT RECEIPT", { align: "center" });
  doc.moveDown(0.3);
  doc.fontSize(8).text("----------------------------------------", { align: "center" });

  // Payment Details
  doc.fontSize(8).font("Helvetica").text(`Date: ${new Date(paymentData.payment_date).toLocaleString()}`, { align: "left" });
  doc.text(`Receipt No: CP-${paymentData.payment_id}`, { align: "left" });
  doc.text(`Sale ID: #${paymentData.sale_id}`, { align: "left" });
  doc.moveDown(0.3);

  // Customer Info
  doc.fontSize(8).font("Helvetica-Bold").text("CUSTOMER:", { align: "left" });
  doc.fontSize(8).font("Helvetica").text(`Name: ${paymentData.customer_name}`, { align: "left" });
  doc.text(`Phone: ${paymentData.customer_phone}`, { align: "left" });
  doc.moveDown(0.3);
  doc.fontSize(8).text("----------------------------------------", { align: "center" });

  // Items with Specifications
  if (paymentData.items && paymentData.items.length > 0) {
    doc.fontSize(8).font("Helvetica-Bold").text("ITEMS:", { align: "left" });
    doc.moveDown(0.2);
    
    paymentData.items.forEach((item, index) => {
      doc.fontSize(7).font("Helvetica-Bold").text(`${index + 1}. ${item.product_name}`, { align: "left" });
      doc.fontSize(6).font("Helvetica").text(`   S/N: ${item.serial_number}`, { align: "left" });
      if (item.specifications) {
        doc.fontSize(6).font("Helvetica").text(`   Specs: ${item.specifications}`, { align: "left" });
      }
      doc.moveDown(0.1);
    });
    
    doc.fontSize(8).text("----------------------------------------", { align: "center" });
  }

  // Payment Info
  doc.fontSize(9).font("Helvetica-Bold").text(`Amount Paid: NGN ${parseFloat(paymentData.amount_paid).toLocaleString()}`, { align: "left" });
  doc.moveDown(0.3);
  doc.fontSize(8).font("Helvetica").text(`Previous Balance: NGN ${parseFloat(paymentData.previous_balance).toLocaleString()}`, { align: "left" });
  doc.fontSize(9).font("Helvetica-Bold").text(`New Balance: NGN ${parseFloat(paymentData.new_balance).toLocaleString()}`, { align: "left" });
  doc.moveDown(0.5);

  doc.fontSize(8).text("----------------------------------------", { align: "center" });

  // Footer
  doc.fontSize(7).font("Helvetica-Oblique").text("Thank you for your payment!", { align: "center" });

  doc.end();
}

// Bulk Reseller Payment Receipt
function generateBulkResellerPaymentReceipt(paymentData, res) {
  const doc = new PDFDocument({
    size: [226.77, 500],
    margins: { top: 10, bottom: 10, left: 10, right: 10 }
  });

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `inline; filename=bulk_payment_receipt_${paymentData.payment_id}.pdf`);

  doc.pipe(res);

  // Business Header
  doc.fontSize(14).font("Helvetica-Bold").text("JIMAS COMPUTERS", { align: "center" });
  doc.fontSize(14).font("Helvetica-Bold").text("NIGERIA LIMITED", { align: "center" });
  doc.moveDown(0.3);
  doc.fontSize(7).font("Helvetica").text("No. 9 Medical Road, Opposite Zenith Bank,", { align: "center" });
  doc.text("Computer Village, Ikeja, Lagos.", { align: "center" });
  doc.moveDown(0.5);

  // Receipt Type
  doc.fontSize(10).font("Helvetica-Bold").text("BULK RESELLER PAYMENT", { align: "center" });
  doc.moveDown(0.3);
  doc.fontSize(8).text("----------------------------------------", { align: "center" });

  // Payment Details
  doc.fontSize(8).font("Helvetica").text(`Date: ${new Date(paymentData.payment_date).toLocaleString()}`, { align: "left" });
  doc.text(`Receipt No: BR-${paymentData.payment_id}`, { align: "left" });
  doc.moveDown(0.3);

  // Reseller Info
  doc.fontSize(8).font("Helvetica-Bold").text("RESELLER:", { align: "left" });
  doc.fontSize(8).font("Helvetica").text(`Name: ${paymentData.reseller_name}`, { align: "left" });
  doc.text(`Phone: ${paymentData.reseller_phone}`, { align: "left" });
  doc.moveDown(0.3);
  doc.fontSize(8).text("----------------------------------------", { align: "center" });

  // Payment Info
  doc.fontSize(9).font("Helvetica-Bold").text(`Amount Paid: NGN ${parseFloat(paymentData.amount_paid).toLocaleString()}`, { align: "left" });
  doc.moveDown(0.3);
  doc.fontSize(8).font("Helvetica").text(`Previous Balance: NGN ${parseFloat(paymentData.previous_balance).toLocaleString()}`, { align: "left" });
  doc.fontSize(9).font("Helvetica-Bold").text(`Balance Left: NGN ${parseFloat(paymentData.balance_left).toLocaleString()}`, { align: "left" });
  doc.moveDown(0.5);

  doc.fontSize(8).text("----------------------------------------", { align: "center" });

  // Footer
  doc.fontSize(7).font("Helvetica-Oblique").text("Thank you for your payment!", { align: "center" });

  doc.end();
}
// =============================================================================
// AUTH ROUTES
// =============================================================================

// Register User (Admin Only)
app.post("/register", authenticate, authorizeAdmin, async (req, res) => {
  const err = validateRequiredFields(["name", "email", "password", "role"], req.body);
  if (err) return res.status(400).json({ error: err });

  const { name, email, password, role, branch_name } = req.body;

  try {
    // Check if user already exists
    const existingUser = await getUserByEmail(email);
    if (existingUser) {
      return res.status(400).json({ error: "User with this email already exists" });
    }

    let branch_id = null;
    if (role === "sales") {
      if (!branch_name) {
        return res.status(400).json({ error: "Missing fields: branch_name (required for sales users)" });
      }
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
  } catch (e) {
    console.error("Register error:", e.message);
    res.status(500).json({ error: "Failed to register user" });
  }
});

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
      { id: user.id, email: user.email, role: user.role, branch_id: user.branch_id, name: user.name },
      JWT_SECRET,
      { expiresIn: "12h" }
    );

    res.json({ token, role: user.role, branch_id: user.branch_id, name: user.name });
  } catch (e) {
    console.error("Login error:", e.message);
    res.status(500).json({ error: "Login failed" });
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
  } catch (e) {
    console.error("Get users error:", e.message);
    res.status(500).json({ error: "Failed to load users" });
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
    if (userToDelete.id === req.user.id) {
      return res.status(400).json({ error: "You cannot delete your own account" });
    }

    await pool.query("DELETE FROM users WHERE id = $1", [user_id]);
    res.json({ message: "User deleted successfully", user_id: user_id });
  } catch (e) {
    console.error("Delete user error:", e.message);
    res.status(500).json({ error: "Failed to delete user" });
  }
});

// =============================================================================
// BRANCH ROUTES
// =============================================================================

// Create Branch (Admin Only)
app.post("/branch", authenticate, authorizeAdmin, async (req, res) => {
  const err = validateRequiredFields(["name", "location"], req.body);
  if (err) return res.status(400).json({ error: err });

  const { name, location } = req.body;

  try {
    const existing = await getBranchByName(name);
    if (existing) {
      return res.status(400).json({ error: "Branch with this name already exists" });
    }

    await pool.query("INSERT INTO branches (name, location) VALUES ($1, $2)", [name, location]);
    res.json({ message: "Branch created successfully" });
  } catch (e) {
    console.error("Create branch error:", e.message);
    res.status(500).json({ error: "Failed to create branch" });
  }
});

// Get All Branches
app.get("/branches", authenticate, async (req, res) => {
  try {
    const result = await pool.query("SELECT id, name, location, created_at FROM branches ORDER BY name");
    res.json({ branches: result.rows });
  } catch (e) {
    console.error("Get branches error:", e.message);
    res.status(500).json({ error: "Failed to load branches" });
  }
});

// =============================================================================
// SUPPLIER ROUTES
// =============================================================================

// Create Supplier (Admin Only - UPDATED)
app.post("/supplier", authenticate, authorizeAdmin, async (req, res) => {
  const err = validateRequiredFields(["name", "contact_info"], req.body);
  if (err) return res.status(400).json({ error: err });

  const { name, contact_info } = req.body;

  try {
    const existing = await getSupplierByName(name);
    if (existing) {
      return res.status(400).json({ error: "Supplier with this name already exists" });
    }

    await pool.query("INSERT INTO suppliers (name, contact_info) VALUES ($1, $2)", [name, contact_info]);
    res.json({ message: "Supplier added successfully" });
  } catch (e) {
    console.error("Create supplier error:", e.message);
    res.status(500).json({ error: "Failed to create supplier" });
  }
});

// Get All Suppliers
app.get("/suppliers", authenticate, async (req, res) => {
  try {
    const result = await pool.query("SELECT id, name, contact_info, created_at FROM suppliers ORDER BY name");
    res.json({ suppliers: result.rows });
  } catch (e) {
    console.error("Get suppliers error:", e.message);
    res.status(500).json({ error: "Failed to load suppliers" });
  }
});

// =============================================================================
// STOCK ROUTES - UPDATED: ADD/DELETE NOW ADMIN ONLY
// =============================================================================

// Add Single Stock Item (ADMIN ONLY - UPDATED)
app.post("/stock", authenticate, authorizeAdmin, async (req, res) => {
  const err = validateRequiredFields(["product_name", "serial_number", "branch_name", "supplier_name", "cost_price"], req.body);
  if (err) return res.status(400).json({ error: err });

  const { product_name, specifications, serial_number, branch_name, supplier_name, cost_price } = req.body;

  try {
    const branch = await getBranchByName(branch_name);
    if (!branch) return res.status(400).json({ error: "Branch not found" });

    const supplier = await getSupplierByName(supplier_name);
    if (!supplier) return res.status(400).json({ error: "Supplier not found" });

    // Check if serial already exists
    const serialCheck = await pool.query("SELECT id FROM serial_numbers WHERE serial_number = $1", [serial_number]);
    if (serialCheck.rows.length) {
      return res.status(400).json({ error: "Serial number already exists in system" });
    }

    await pool.query(
      `INSERT INTO serial_numbers (product_name, specifications, serial_number, branch_id, supplier_id, cost_price, status)
       VALUES ($1, $2, $3, $4, $5, $6, 'available')`,
      [product_name, specifications || "", serial_number, branch.id, supplier.id, cost_price]
    );

    res.json({ message: "Stock added successfully" });
  } catch (e) {
    console.error("Add stock error:", e.message);
    res.status(500).json({ error: "Failed to add stock" });
  }
});

// Add Stock in Bulk (ADMIN ONLY - UPDATED)
app.post("/stock/bulk", authenticate, authorizeAdmin, async (req, res) => {
  const err = validateRequiredFields(["product_name", "branch_name", "supplier_name", "cost_price", "serial_numbers"], req.body);
  if (err) return res.status(400).json({ error: err });

  const { product_name, specifications, branch_name, supplier_name, cost_price, serial_numbers } = req.body;

  // Validate serial_numbers is an array
  if (!Array.isArray(serial_numbers) || serial_numbers.length === 0) {
    return res.status(400).json({ error: "serial_numbers must be a non-empty array" });
  }

  try {
    const branch = await getBranchByName(branch_name);
    if (!branch) return res.status(400).json({ error: "Branch not found" });

    const supplier = await getSupplierByName(supplier_name);
    if (!supplier) return res.status(400).json({ error: "Supplier not found" });

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      let addedCount = 0;
      const duplicates = [];

      for (const serial of serial_numbers) {
        const trimmedSerial = serial.trim();
        if (!trimmedSerial) continue;

        // Check if serial already exists
        const serialCheck = await client.query("SELECT id FROM serial_numbers WHERE serial_number = $1", [trimmedSerial]);
        if (serialCheck.rows.length) {
          duplicates.push(trimmedSerial);
          continue;
        }

        await client.query(
          `INSERT INTO serial_numbers (product_name, specifications, serial_number, branch_id, supplier_id, cost_price, status)
           VALUES ($1, $2, $3, $4, $5, $6, 'available')`,
          [product_name, specifications || "", trimmedSerial, branch.id, supplier.id, cost_price]
        );
        addedCount++;
      }

      await client.query("COMMIT");

      let message = `Successfully added ${addedCount} laptop(s)`;
      if (duplicates.length > 0) {
        message += `. ${duplicates.length} serial(s) already existed and were skipped: ${duplicates.join(", ")}`;
      }

      res.json({ message, added: addedCount, duplicates: duplicates });
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }
  } catch (e) {
    console.error("Bulk add stock error:", e.message);
    res.status(500).json({ error: "Failed to add stock in bulk" });
  }
});

// Return to Supplier / Delete Stock (ADMIN ONLY - UPDATED)
app.delete("/stock/:serial_number", authenticate, authorizeAdmin, async (req, res) => {
  const { serial_number } = req.params;
  const { reason } = req.body;

  try {
    const laptop = await pool.query(
      "SELECT * FROM serial_numbers WHERE serial_number = $1",
      [serial_number]
    );

    if (!laptop.rows.length) {
      return res.status(404).json({ error: "Laptop not found" });
    }

    const laptopData = laptop.rows[0];

    // Cannot delete sold laptops
    if (laptopData.status === "sold") {
      return res.status(400).json({ error: "Cannot return sold laptops. Process a return first." });
    }

    await pool.query("DELETE FROM serial_numbers WHERE serial_number = $1", [serial_number]);

    res.json({
      message: "Laptop returned to supplier successfully",
      serial_number: serial_number,
      reason: reason || "No reason provided"
    });
  } catch (e) {
    console.error("Delete stock error:", e.message);
    res.status(500).json({ error: "Failed to return laptop to supplier" });
  }
});

// Transfer Stock to Another Branch (Admin Only)
app.post("/stock/transfer", authenticate, authorizeAdmin, async (req, res) => {
  const err = validateRequiredFields(["serial_number", "to_branch_name"], req.body);
  if (err) return res.status(400).json({ error: err });

  const { serial_number, to_branch_name } = req.body;

  try {
    const laptop = await pool.query(
      `SELECT sn.*, b.name AS current_branch_name 
       FROM serial_numbers sn 
       JOIN branches b ON b.id = sn.branch_id 
       WHERE sn.serial_number = $1`,
      [serial_number]
    );

    if (!laptop.rows.length) {
      return res.status(404).json({ error: "Laptop not found" });
    }

    const laptopData = laptop.rows[0];

    if (laptopData.status === "sold") {
      return res.status(400).json({ error: "Cannot transfer sold laptops" });
    }

    const toBranch = await getBranchByName(to_branch_name);
    if (!toBranch) {
      return res.status(400).json({ error: "Destination branch not found" });
    }

    if (laptopData.branch_id === toBranch.id) {
      return res.status(400).json({ error: "Laptop is already in this branch" });
    }

    await pool.query(
      "UPDATE serial_numbers SET branch_id = $1 WHERE serial_number = $2",
      [toBranch.id, serial_number]
    );

    res.json({
      message: "Stock transferred successfully",
      serial_number: serial_number,
      from_branch: laptopData.current_branch_name,
      to_branch: to_branch_name
    });
  } catch (e) {
    console.error("Transfer stock error:", e.message);
    res.status(500).json({ error: "Failed to transfer stock" });
  }
});

// Lookup Serial Number
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
    console.error("Lookup serial error:", e.message);
    res.status(500).json({ error: "Failed to lookup serial number" });
  }
});

// Get Stock Groups
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

    // Admin sees all branches
    const result = await pool.query(
      `SELECT sn.product_name, b.name AS branch_name, b.id AS branch_id, COUNT(*) AS total_available
       FROM serial_numbers sn
       JOIN branches b ON b.id = sn.branch_id
       WHERE sn.status IN ('available', 'returned')
       GROUP BY sn.product_name, b.name, b.id
       ORDER BY sn.product_name, b.name`
    );

    res.json({ groups: result.rows });
  } catch (e) {
    console.error("Get stock groups error:", e.message);
    res.status(500).json({ error: "Failed to load stock groups" });
  }
});

// Get Stock Group Items
app.get("/stock/groups/:product_name", authenticate, async (req, res) => {
  try {
    const product = decodeURIComponent(req.params.product_name);

    if (req.user.role === "sales") {
      const result = await pool.query(
        `SELECT sn.*, b.name AS branch_name, s.name AS supplier_name
         FROM serial_numbers sn
         JOIN branches b ON b.id = sn.branch_id
         JOIN suppliers s ON s.id = sn.supplier_id
         WHERE sn.product_name = $1 AND sn.status IN ('available', 'returned') AND sn.branch_id = $2
         ORDER BY sn.created_at DESC`,
        [product, req.user.branch_id]
      );
      return res.json({ product_name: product, items: result.rows });
    }

    // Admin sees all
    const result = await pool.query(
      `SELECT sn.*, b.name AS branch_name, s.name AS supplier_name
       FROM serial_numbers sn
       JOIN branches b ON b.id = sn.branch_id
       JOIN suppliers s ON s.id = sn.supplier_id
       WHERE sn.product_name = $1 AND sn.status IN ('available', 'returned')
       ORDER BY b.name, sn.created_at DESC`,
      [product]
    );

    res.json({ product_name: product, items: result.rows });
  } catch (e) {
    console.error("Get stock group items error:", e.message);
    res.status(500).json({ error: "Failed to load stock items" });
  }
});
// =============================================================================
// SALES ROUTES - UPDATED WITH SALES_NOTE
// =============================================================================

// Create Sale (Cash or Credit) - UPDATED WITH SALES_NOTE
app.post("/sales", authenticate, async (req, res) => {
  const required = ["sold_by_email", "branch_name", "payment_type", "customer_name", "customer_phone", "items"];
  const err = validateRequiredFields(required, req.body);
  if (err) return res.status(400).json({ error: err });

  const { sold_by_email, branch_name, payment_type, customer_name, customer_phone, items, vat_enabled, vat_percentage, sales_note } = req.body;

  // Validate items
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: "Items must be a non-empty array" });
  }

  try {
    const user = await getUserByEmail(sold_by_email);
    if (!user) return res.status(400).json({ error: "Seller not found" });

    const branch = await getBranchByName(branch_name);
    if (!branch) return res.status(400).json({ error: "Branch not found" });

    // Sales users can only sell from their branch
    if (user.role === "sales" && user.branch_id !== branch.id) {
      return res.status(403).json({ error: "You can only make sales in your assigned branch" });
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      let creditCustomerId = null;

      // For credit sales, get or create credit customer
      if (payment_type.toLowerCase() === "credit") {
        const existingCustomer = await client.query(
          "SELECT * FROM credit_customers WHERE contact_info = $1",
          [customer_phone]
        );

        if (existingCustomer.rows.length) {
          creditCustomerId = existingCustomer.rows[0].id;
        } else {
          const newCustomer = await client.query(
            `INSERT INTO credit_customers (name, contact_info, customer_type, open_balance, total_purchases)
             VALUES ($1, $2, 'regular', 0, 0) RETURNING id`,
            [customer_name, customer_phone]
          );
          creditCustomerId = newCustomer.rows[0].id;
        }
      }

      let subtotal = 0;
      let totalCost = 0;
      const laptopItems = [];

      // Process each item
      for (const item of items) {
        const itemErr = validateRequiredFields(["serial_number", "price"], item);
        if (itemErr) throw new Error(itemErr);

        const { serial_number, price, ram_price, storage_price } = item;

        const laptopResult = await client.query(
          "SELECT * FROM serial_numbers WHERE serial_number = $1 AND branch_id = $2",
          [serial_number, branch.id]
        );

        if (!laptopResult.rows.length) {
          throw new Error(`Serial ${serial_number} not found in this branch`);
        }

        const laptop = laptopResult.rows[0];

        // UPDATED: Allow both 'available' and 'returned' status laptops to be sold
        if (!["available", "returned"].includes(laptop.status)) {
          throw new Error(`Serial ${serial_number} is ${laptop.status} and cannot be sold`);
        }

        const laptopPrice = parseFloat(price) || 0;
        const ramUpgrade = parseFloat(ram_price) || 0;
        const storageUpgrade = parseFloat(storage_price) || 0;
        const itemTotal = laptopPrice + ramUpgrade + storageUpgrade;

        subtotal += itemTotal;
        totalCost += parseFloat(laptop.cost_price);

        laptopItems.push({
          laptop_id: laptop.id,
          product_name: laptop.product_name,
          serial_number: laptop.serial_number,
          specifications: laptop.specifications,
          price: laptopPrice,
          ram_upgrade: ramUpgrade,
          storage_upgrade: storageUpgrade,
          cost_price: parseFloat(laptop.cost_price)
        });
      }

      // Calculate VAT if enabled
      let vatAmount = 0;
      const vatPct = parseFloat(vat_percentage) || 0;
      if (vat_enabled && vatPct > 0) {
        vatAmount = (subtotal * vatPct) / 100;
      }

      const totalAmount = subtotal + vatAmount;
      const totalProfit = subtotal - totalCost;

      // Create sale record - UPDATED WITH SALES_NOTE
      const saleResult = await client.query(
        `INSERT INTO sales 
         (branch_id, sold_by_email, payment_type, customer_name, customer_phone, 
          subtotal, vat_enabled, vat_percentage, vat_amount, total_amount, 
          total_cost, total_profit, unsettled_balance, is_credit, credit_customer_id, is_voided, sales_note)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, false, $16)
         RETURNING id, created_at`,
        [
          branch.id,
          sold_by_email,
          payment_type.toLowerCase(),
          customer_name,
          customer_phone,
          subtotal,
          vat_enabled || false,
          vatPct,
          vatAmount,
          totalAmount,
          totalCost,
          totalProfit,
          payment_type.toLowerCase() === "credit" ? totalAmount : 0,
          payment_type.toLowerCase() === "credit",
          creditCustomerId,
          sales_note || null
        ]
      );

      const saleId = saleResult.rows[0].id;

      // Insert sale items and update laptop status
      for (const litem of laptopItems) {
        await client.query(
          `INSERT INTO sale_items (sale_id, serial_number_id, price, ram_upgrade_price, storage_upgrade_price)
           VALUES ($1, $2, $3, $4, $5)`,
          [saleId, litem.laptop_id, litem.price, litem.ram_upgrade, litem.storage_upgrade]
        );

        await client.query(
          "UPDATE serial_numbers SET status = 'sold', sale_price = $1 WHERE id = $2",
          [litem.price, litem.laptop_id]
        );
      }

      // Update credit customer balance for credit sales
      if (creditCustomerId) {
        await client.query(
          `UPDATE credit_customers 
           SET open_balance = open_balance + $1, total_purchases = total_purchases + $1 
           WHERE id = $2`,
          [totalAmount, creditCustomerId]
        );
      }

      await client.query("COMMIT");

      // Low stock warning
      let lowStockWarning = null;
      const firstProduct = laptopItems[0];
      if (firstProduct) {
        const stockLeft = await pool.query(
          `SELECT COUNT(*) AS total FROM serial_numbers 
           WHERE product_name = $1 AND branch_id = $2 AND status IN ('available', 'returned')`,
          [firstProduct.product_name, branch.id]
        );
        const remaining = parseInt(stockLeft.rows[0].total);
        if (remaining <= 5) {
          lowStockWarning = `LOW STOCK: Only ${remaining} unit(s) of ${firstProduct.product_name} remaining`;
        }
      }

      const response = {
        message: "Sale recorded successfully",
        sale_id: saleId,
        payment_type: payment_type.toLowerCase(),
        subtotal: subtotal,
        vat_amount: vatAmount,
        total_amount: totalAmount,
        profit: totalProfit
      };

      // Only include receipt URL for cash sales
      if (payment_type.toLowerCase() === "cash") {
        response.receipt_url = `/receipt/sale/${saleId}`;
      }

      if (lowStockWarning) {
        response.warning = lowStockWarning;
      }

      res.json(response);

    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }
  } catch (e) {
    console.error("Sale error:", e.message);
    res.status(500).json({ error: e.message });
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

    res.json({ sale: sale.rows[0], items: items.rows });
  } catch (e) {
    console.error("Get sale error:", e.message);
    res.status(500).json({ error: "Failed to load sale details" });
  }
});

// Cash Sale Receipt - UPDATED WITH SPECIFICATIONS AND SALES_NOTE
app.get("/receipt/sale/:sale_id", async (req, res) => {
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
    if (saleData.payment_type !== "cash") {
      return res.status(400).json({ error: "Receipts are only generated for cash sales" });
    }

    // UPDATED: Include specifications in items
    const items = await pool.query(
      `SELECT si.*, sn.product_name, sn.serial_number, sn.specifications
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
      items: items.rows,
      subtotal: saleData.subtotal,
      vat_enabled: saleData.vat_enabled,
      vat_percentage: saleData.vat_percentage,
      vat_amount: saleData.vat_amount,
      total_amount: saleData.total_amount,
    };

    generateCashSaleReceipt(receiptData, res);
  } catch (e) {
    console.error("Receipt error:", e.message);
    res.status(500).json({ error: "Failed to generate receipt" });
  }
});

// =============================================================================
// RETURN ROUTES
// =============================================================================

// Cash Return
app.post("/cash-return", authenticate, async (req, res) => {
  const err = validateRequiredFields(["serial_number", "sale_id"], req.body);
  if (err) return res.status(400).json({ error: err });

  const { serial_number, sale_id } = req.body;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const saleItemResult = await client.query(
      `SELECT si.*, sn.cost_price, sn.id AS laptop_id
       FROM sale_items si
       JOIN serial_numbers sn ON sn.id = si.serial_number_id
       WHERE sn.serial_number = $1 AND si.sale_id = $2`,
      [serial_number, sale_id]
    );

    if (!saleItemResult.rows.length) {
      throw new Error("Sale item not found");
    }

    const saleItem = saleItemResult.rows[0];
    const itemTotal = parseFloat(saleItem.price) + parseFloat(saleItem.ram_upgrade_price || 0) + parseFloat(saleItem.storage_upgrade_price || 0);
    const costPrice = parseFloat(saleItem.cost_price);
    const profitToReverse = itemTotal - costPrice;

    // Get sale to update totals
    const saleResult = await client.query("SELECT * FROM sales WHERE id = $1", [sale_id]);
    if (!saleResult.rows.length) {
      throw new Error("Sale not found");
    }

    const sale = saleResult.rows[0];

    if (sale.payment_type !== "cash") {
      throw new Error("Use credit-return endpoint for credit sales");
    }

    // Update sale totals
    await client.query(
      `UPDATE sales 
       SET subtotal = subtotal - $1, 
           total_amount = total_amount - $1, 
           total_cost = total_cost - $2, 
           total_profit = total_profit - $3 
       WHERE id = $4`,
      [itemTotal, costPrice, profitToReverse, sale_id]
    );

    // Mark laptop as returned (can be sold again)
    await client.query(
      "UPDATE serial_numbers SET status = 'returned', sale_price = NULL WHERE id = $1",
      [saleItem.laptop_id]
    );

    // Delete sale item
    await client.query("DELETE FROM sale_items WHERE id = $1", [saleItem.id]);

    await client.query("COMMIT");

    res.json({ message: "Cash return processed successfully", serial_number: serial_number });
  } catch (e) {
    await client.query("ROLLBACK");
    console.error("Cash return error:", e.message);
    res.status(500).json({ error: e.message });
  } finally {
    client.release();
  }
});

// Credit Return
app.post("/credit-return", authenticate, async (req, res) => {
  const err = validateRequiredFields(["serial_number", "sale_id", "customer_phone"], req.body);
  if (err) return res.status(400).json({ error: err });

  const { serial_number, sale_id, customer_phone } = req.body;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const saleItemResult = await client.query(
      `SELECT si.*, sn.cost_price, sn.id AS laptop_id
       FROM sale_items si
       JOIN serial_numbers sn ON sn.id = si.serial_number_id
       WHERE sn.serial_number = $1 AND si.sale_id = $2`,
      [serial_number, sale_id]
    );

    if (!saleItemResult.rows.length) {
      throw new Error("Sale item not found");
    }

    const saleItem = saleItemResult.rows[0];
    const itemTotal = parseFloat(saleItem.price) + parseFloat(saleItem.ram_upgrade_price || 0) + parseFloat(saleItem.storage_upgrade_price || 0);
    const costPrice = parseFloat(saleItem.cost_price);
    const profitToReverse = itemTotal - costPrice;

    // Get sale
    const saleResult = await client.query("SELECT * FROM sales WHERE id = $1", [sale_id]);
    if (!saleResult.rows.length) {
      throw new Error("Sale not found");
    }

    const sale = saleResult.rows[0];

    if (sale.payment_type !== "credit") {
      throw new Error("Use cash-return endpoint for cash sales");
    }

    // Update sale totals
    const newUnsettled = Math.max(0, parseFloat(sale.unsettled_balance) - itemTotal);
    await client.query(
      `UPDATE sales 
       SET subtotal = subtotal - $1, 
           total_amount = total_amount - $1, 
           total_cost = total_cost - $2, 
           total_profit = total_profit - $3,
           unsettled_balance = $4
       WHERE id = $5`,
      [itemTotal, costPrice, profitToReverse, newUnsettled, sale_id]
    );

    // Update credit customer balance (clamp at 0)
    const customer = await client.query(
      "SELECT * FROM credit_customers WHERE contact_info = $1",
      [customer_phone]
    );

    if (customer.rows.length) {
      const newBalance = Math.max(0, parseFloat(customer.rows[0].open_balance) - itemTotal);
      const newTotalPurchases = Math.max(0, parseFloat(customer.rows[0].total_purchases) - itemTotal);

      await client.query(
        "UPDATE credit_customers SET open_balance = $1, total_purchases = $2 WHERE id = $3",
        [newBalance, newTotalPurchases, customer.rows[0].id]
      );
    }

    // Mark laptop as returned (can be sold again)
    await client.query(
      "UPDATE serial_numbers SET status = 'returned', sale_price = NULL WHERE id = $1",
      [saleItem.laptop_id]
    );

    // Delete sale item
    await client.query("DELETE FROM sale_items WHERE id = $1", [saleItem.id]);

    await client.query("COMMIT");

    res.json({ message: "Credit return processed successfully", serial_number: serial_number });
  } catch (e) {
    await client.query("ROLLBACK");
    console.error("Credit return error:", e.message);
    res.status(500).json({ error: e.message });
  } finally {
    client.release();
  }
});
// =============================================================================
// CREDIT CUSTOMER ROUTES
// =============================================================================

// Get All Credit Customers
app.get("/credit-customers", authenticate, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, name, contact_info, customer_type, open_balance, total_purchases, created_at
       FROM credit_customers
       ORDER BY name`
    );
    res.json({ customers: result.rows });
  } catch (e) {
    console.error("Get credit customers error:", e.message);
    res.status(500).json({ error: "Failed to load credit customers" });
  }
});

// Get Credit Customer Debts - UPDATED WITH SPECIFICATIONS
app.get("/credit-customers/:contact_info/debts", authenticate, async (req, res) => {
  try {
    const phone = req.params.contact_info;

    const customer = await pool.query(
      "SELECT * FROM credit_customers WHERE contact_info = $1",
      [phone]
    );

    if (!customer.rows.length) {
      return res.status(404).json({ error: "Credit customer not found" });
    }

    const customerId = customer.rows[0].id;

    // UPDATED: Include specifications in items
    const debts = await pool.query(
      `SELECT s.id AS sale_id, s.total_amount, s.unsettled_balance, s.created_at, s.sales_note,
              array_agg(json_build_object(
                'product_name', sn.product_name,
                'serial_number', sn.serial_number,
                'specifications', sn.specifications,
                'price', si.price
              )) AS items
       FROM sales s
       JOIN sale_items si ON si.sale_id = s.id
       JOIN serial_numbers sn ON sn.id = si.serial_number_id
       WHERE s.payment_type = 'credit' AND s.credit_customer_id = $1 AND s.is_voided = false AND s.unsettled_balance > 0
       GROUP BY s.id
       ORDER BY s.created_at DESC`,
      [customerId]
    );

    res.json({
      customer: customer.rows[0],
      unsettled_sales: debts.rows
    });
  } catch (e) {
    console.error("Get customer debts error:", e.message);
    res.status(500).json({ error: "Failed to load customer debts" });
  }
});

// Credit Payment - UPDATED TO INCLUDE SPECS IN RECEIPT
app.post("/credit-payment", authenticate, async (req, res) => {
  const err = validateRequiredFields(["customer_phone", "amount", "sale_id"], req.body);
  if (err) return res.status(400).json({ error: err });

  const { customer_phone, amount, sale_id } = req.body;
  const paymentAmount = parseFloat(amount);

  if (paymentAmount <= 0) {
    return res.status(400).json({ error: "Payment amount must be greater than 0" });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const customer = await client.query(
      "SELECT * FROM credit_customers WHERE contact_info = $1",
      [customer_phone]
    );

    if (!customer.rows.length) {
      throw new Error("Credit customer not found");
    }

    const customerId = customer.rows[0].id;
    const previousBalance = parseFloat(customer.rows[0].open_balance);

    // Verify sale exists and belongs to customer
    const saleCheck = await client.query(
      "SELECT * FROM sales WHERE id = $1 AND credit_customer_id = $2 AND is_voided = false",
      [sale_id, customerId]
    );

    if (!saleCheck.rows.length) {
      throw new Error("Sale not found or does not belong to this customer");
    }

    const sale = saleCheck.rows[0];
    const saleUnsettled = parseFloat(sale.unsettled_balance);

    // Calculate actual payment (can't pay more than owed)
    const actualPayment = Math.min(paymentAmount, saleUnsettled);

    // Record payment
    const paymentResult = await client.query(
      `INSERT INTO credit_payments (credit_customer_id, amount, sale_id)
       VALUES ($1, $2, $3) RETURNING id, created_at`,
      [customerId, actualPayment, sale_id]
    );

    // Update sale unsettled balance (clamp at 0)
    const newSaleUnsettled = Math.max(0, saleUnsettled - actualPayment);
    await client.query(
      "UPDATE sales SET unsettled_balance = $1 WHERE id = $2",
      [newSaleUnsettled, sale_id]
    );

    // Update customer balance (clamp at 0)
    const newBalance = Math.max(0, previousBalance - actualPayment);
    await client.query(
      "UPDATE credit_customers SET open_balance = $1 WHERE id = $2",
      [newBalance, customerId]
    );

    await client.query("COMMIT");

    res.json({
      message: "Credit payment recorded successfully",
      payment_id: paymentResult.rows[0].id,
      amount_paid: actualPayment,
      previous_balance: previousBalance,
      new_balance: newBalance,
      receipt_url: `/receipt/credit-payment/${paymentResult.rows[0].id}`
    });
  } catch (e) {
    await client.query("ROLLBACK");
    console.error("Credit payment error:", e.message);
    res.status(500).json({ error: e.message });
  } finally {
    client.release();
  }
});

// Credit Payment Receipt - UPDATED WITH SPECIFICATIONS
app.get("/receipt/credit-payment/:payment_id", async (req, res) => {
  try {
    const { payment_id } = req.params;

    const payment = await pool.query(
      `SELECT cp.*, cc.name AS customer_name, cc.contact_info AS customer_phone, cc.open_balance
       FROM credit_payments cp
       JOIN credit_customers cc ON cc.id = cp.credit_customer_id
       WHERE cp.id = $1`,
      [payment_id]
    );

    if (!payment.rows.length) {
      return res.status(404).json({ error: "Payment not found" });
    }

    const p = payment.rows[0];

    // Get items with specifications for this sale
    const items = await pool.query(
      `SELECT sn.product_name, sn.serial_number, sn.specifications, si.price
       FROM sale_items si
       JOIN serial_numbers sn ON sn.id = si.serial_number_id
       WHERE si.sale_id = $1`,
      [p.sale_id]
    );

    const paymentData = {
      payment_id: p.id,
      payment_date: p.created_at,
      sale_id: p.sale_id,
      customer_name: p.customer_name,
      customer_phone: p.customer_phone,
      amount_paid: p.amount,
      previous_balance: parseFloat(p.open_balance) + parseFloat(p.amount),
      new_balance: p.open_balance,
      items: items.rows
    };

    generateCreditPaymentReceipt(paymentData, res);
  } catch (e) {
    console.error("Credit payment receipt error:", e.message);
    res.status(500).json({ error: "Failed to generate receipt" });
  }
});

// RECALCULATE CREDIT CUSTOMER BALANCE (ADMIN ONLY)
app.post("/credit-customers/:contact_info/recalculate-balance", authenticate, authorizeAdmin, async (req, res) => {
  const { contact_info } = req.params;

  try {
    const customer = await pool.query(
      "SELECT * FROM credit_customers WHERE contact_info = $1",
      [contact_info]
    );

    if (!customer.rows.length) {
      return res.status(404).json({ error: "Credit customer not found" });
    }

    const customerId = customer.rows[0].id;
    const previousBalance = parseFloat(customer.rows[0].open_balance) || 0;

    // Calculate total unsettled balance from all credit sales
    const unsettledResult = await pool.query(
      `SELECT COALESCE(SUM(unsettled_balance), 0) AS total 
       FROM sales 
       WHERE credit_customer_id = $1 AND is_credit = true AND is_voided = false`,
      [customerId]
    );

    const correctBalance = parseFloat(unsettledResult.rows[0].total) || 0;

    // Update customer balance
    await pool.query(
      "UPDATE credit_customers SET open_balance = $1 WHERE id = $2",
      [correctBalance, customerId]
    );

    res.json({
      message: "Balance recalculated successfully",
      customer_name: customer.rows[0].name,
      customer_phone: contact_info,
      previous_balance: previousBalance,
      correct_balance: correctBalance,
      difference: previousBalance - correctBalance
    });
  } catch (e) {
    console.error("Recalculate credit customer balance error:", e.message);
    res.status(500).json({ error: e.message });
  }
});

// =============================================================================
// BULK RESELLER ROUTES - UPDATED WITH DELETE AND RETURN FEATURES
// =============================================================================

// Create Bulk Reseller (ADMIN ONLY - UPDATED)
app.post("/bulk-resellers", authenticate, authorizeAdmin, async (req, res) => {
  const err = validateRequiredFields(["name", "contact_info"], req.body);
  if (err) return res.status(400).json({ error: err });

  const { name, contact_info } = req.body;

  try {
    // Check if already exists
    const existing = await pool.query(
      "SELECT * FROM credit_customers WHERE contact_info = $1",
      [contact_info]
    );

    if (existing.rows.length) {
      // Update to bulk reseller if exists
      await pool.query(
        "UPDATE credit_customers SET customer_type = 'bulk_reseller', name = $1 WHERE contact_info = $2",
        [name, contact_info]
      );
      return res.json({ message: "Customer upgraded to bulk reseller" });
    }

    await pool.query(
      `INSERT INTO credit_customers (name, contact_info, customer_type, open_balance, total_purchases)
       VALUES ($1, $2, 'bulk_reseller', 0, 0)`,
      [name, contact_info]
    );

    res.json({ message: "Bulk reseller created successfully" });
  } catch (e) {
    console.error("Create bulk reseller error:", e.message);
    res.status(500).json({ error: "Failed to create bulk reseller" });
  }
});

// Get All Bulk Resellers
app.get("/bulk-resellers", authenticate, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, name, contact_info, open_balance, total_purchases, created_at
       FROM credit_customers
       WHERE customer_type = 'bulk_reseller'
       ORDER BY name`
    );
    res.json({ resellers: result.rows });
  } catch (e) {
    console.error("Get bulk resellers error:", e.message);
    res.status(500).json({ error: "Failed to load bulk resellers" });
  }
});

// DELETE BULK RESELLER (ADMIN ONLY - NEW FEATURE)
app.delete("/bulk-resellers/:reseller_id", authenticate, authorizeAdmin, async (req, res) => {
  const { reseller_id } = req.params;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Check if reseller exists
    const reseller = await client.query(
      "SELECT * FROM credit_customers WHERE id = $1 AND customer_type = 'bulk_reseller'",
      [reseller_id]
    );

    if (!reseller.rows.length) {
      throw new Error("Bulk reseller not found");
    }

    const resellerData = reseller.rows[0];

    // Check if reseller has outstanding balance
    if (parseFloat(resellerData.open_balance) > 0) {
      throw new Error(`Cannot delete reseller with outstanding balance of ₦${parseFloat(resellerData.open_balance).toLocaleString()}. Clear balance first.`);
    }

    // Check if reseller has items in credit book
    const itemsCheck = await client.query(
      "SELECT COUNT(*) AS count FROM bulk_reseller_items WHERE reseller_id = $1",
      [reseller_id]
    );

    if (parseInt(itemsCheck.rows[0].count) > 0) {
      throw new Error("Cannot delete reseller with items in credit book. Return all items first.");
    }

    // Delete payments history
    await client.query("DELETE FROM bulk_reseller_payments WHERE reseller_id = $1", [reseller_id]);

    // Delete the reseller
    await client.query("DELETE FROM credit_customers WHERE id = $1", [reseller_id]);

    await client.query("COMMIT");

    res.json({
      message: "Bulk reseller deleted successfully",
      reseller_name: resellerData.name
    });
  } catch (e) {
    await client.query("ROLLBACK");
    console.error("Delete bulk reseller error:", e.message);
    res.status(500).json({ error: e.message });
  } finally {
    client.release();
  }
});

// Add Laptops to Bulk Reseller Credit Book (Sales can do this - UPDATED)
app.post("/bulk-resellers/:reseller_id/add-laptops", authenticate, async (req, res) => {
  const err = validateRequiredFields(["branch_name", "items"], req.body);
  if (err) return res.status(400).json({ error: err });

  const { reseller_id } = req.params;
  const { branch_name, items } = req.body;

  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: "Items must be a non-empty array" });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Verify reseller exists
    const reseller = await client.query(
      "SELECT * FROM credit_customers WHERE id = $1 AND customer_type = 'bulk_reseller'",
      [reseller_id]
    );

    if (!reseller.rows.length) {
      throw new Error("Bulk reseller not found");
    }

    const branch = await getBranchByName(branch_name);
    if (!branch) throw new Error("Branch not found");

    // Sales users can only add from their branch
    if (req.user.role === "sales" && req.user.branch_id !== branch.id) {
      throw new Error("You can only add laptops from your assigned branch");
    }

    let totalAmount = 0;
    const addedItems = [];

    for (const item of items) {
      const { serial_number, given_price } = item;

      if (!serial_number || !given_price) {
        throw new Error("Each item must have serial_number and given_price");
      }

      const laptop = await client.query(
        "SELECT * FROM serial_numbers WHERE serial_number = $1 AND branch_id = $2",
        [serial_number, branch.id]
      );

      if (!laptop.rows.length) {
        throw new Error(`Serial ${serial_number} not found in branch`);
      }

      if (!["available", "returned"].includes(laptop.rows[0].status)) {
        throw new Error(`Serial ${serial_number} is not available`);
      }

      const price = parseFloat(given_price);
      totalAmount += price;

      // Add to credit book
      await client.query(
        `INSERT INTO bulk_reseller_items (reseller_id, serial_number_id, given_price)
         VALUES ($1, $2, $3)`,
        [reseller_id, laptop.rows[0].id, price]
      );

      // Mark laptop as sold
      await client.query(
        "UPDATE serial_numbers SET status = 'sold', sale_price = $1 WHERE id = $2",
        [price, laptop.rows[0].id]
      );

      addedItems.push({
        serial_number: serial_number,
        product_name: laptop.rows[0].product_name,
        given_price: price
      });
    }

    // Update reseller balance
    await client.query(
      `UPDATE credit_customers 
       SET open_balance = open_balance + $1, total_purchases = total_purchases + $1 
       WHERE id = $2`,
      [totalAmount, reseller_id]
    );

    await client.query("COMMIT");

    res.json({
      message: `Added ${addedItems.length} laptop(s) to credit book`,
      items: addedItems,
      total_added: totalAmount,
      new_balance: parseFloat(reseller.rows[0].open_balance) + totalAmount
    });
  } catch (e) {
    await client.query("ROLLBACK");
    console.error("Add to credit book error:", e.message);
    res.status(500).json({ error: e.message });
  } finally {
    client.release();
  }
});

// RETURN LAPTOP FROM BULK RESELLER (FIXED VERSION)
app.post("/bulk-resellers/:reseller_id/return-laptop", authenticate, async (req, res) => {
  const err = validateRequiredFields(["serial_number"], req.body);
  if (err) return res.status(400).json({ error: err });

  const { reseller_id } = req.params;
  const { serial_number } = req.body;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Verify reseller exists and get current balance
    const reseller = await client.query(
      "SELECT * FROM credit_customers WHERE id = $1 AND customer_type = 'bulk_reseller'",
      [reseller_id]
    );

    if (!reseller.rows.length) {
      throw new Error("Bulk reseller not found");
    }

    const currentBalance = parseFloat(reseller.rows[0].open_balance) || 0;
    const currentTotalPurchases = parseFloat(reseller.rows[0].total_purchases) || 0;

    // Find the item in credit book - get price BEFORE deleting
    const itemResult = await client.query(
      `SELECT bri.id AS item_id, bri.given_price, bri.serial_number_id,
              sn.serial_number, sn.product_name, sn.id AS laptop_id
       FROM bulk_reseller_items bri
       JOIN serial_numbers sn ON sn.id = bri.serial_number_id
       WHERE bri.reseller_id = $1 AND sn.serial_number = $2`,
      [reseller_id, serial_number]
    );

    if (!itemResult.rows.length) {
      throw new Error("Laptop not found in this reseller's credit book");
    }

    const item = itemResult.rows[0];
    const givenPrice = parseFloat(item.given_price) || 0;

    console.log(`Return laptop: Reseller ${reseller_id}, Serial: ${serial_number}`);
    console.log(`Current balance: ${currentBalance}, Given price: ${givenPrice}`);

    // Calculate new balances - clamp at 0
    const newBalance = Math.max(0, currentBalance - givenPrice);
    const newTotalPurchases = Math.max(0, currentTotalPurchases - givenPrice);

    console.log(`New balance will be: ${newBalance}`);

    // Step 1: Update reseller balance FIRST (before deleting the item)
    await client.query(
      "UPDATE credit_customers SET open_balance = $1, total_purchases = $2 WHERE id = $3",
      [newBalance, newTotalPurchases, reseller_id]
    );

    // Step 2: Remove from credit book
    await client.query("DELETE FROM bulk_reseller_items WHERE id = $1", [item.item_id]);

    // Step 3: Mark laptop as returned (available for sale again)
    await client.query(
      "UPDATE serial_numbers SET status = 'returned', sale_price = NULL WHERE id = $1",
      [item.laptop_id]
    );

    await client.query("COMMIT");

    // Verify the update worked
    const verifyResult = await pool.query(
      "SELECT open_balance, total_purchases FROM credit_customers WHERE id = $1",
      [reseller_id]
    );

    res.json({
      message: "Laptop returned successfully",
      serial_number: serial_number,
      product_name: item.product_name,
      previous_balance: currentBalance,
      amount_reduced: givenPrice,
      new_balance: parseFloat(verifyResult.rows[0].open_balance),
      new_total_purchases: parseFloat(verifyResult.rows[0].total_purchases)
    });
  } catch (e) {
    await client.query("ROLLBACK");
    console.error("Return laptop from bulk reseller error:", e.message);
    res.status(500).json({ error: e.message });
  } finally {
    client.release();
  }
});

// Get Bulk Reseller Credit Book
app.get("/bulk-resellers/:reseller_id/credit-book", authenticate, async (req, res) => {
  try {
    const { reseller_id } = req.params;

    const reseller = await pool.query(
      "SELECT * FROM credit_customers WHERE id = $1 AND customer_type = 'bulk_reseller'",
      [reseller_id]
    );

    if (!reseller.rows.length) {
      return res.status(404).json({ error: "Bulk reseller not found" });
    }

    const items = await pool.query(
      `SELECT bri.*, sn.product_name, sn.serial_number, sn.specifications
       FROM bulk_reseller_items bri
       JOIN serial_numbers sn ON sn.id = bri.serial_number_id
       WHERE bri.reseller_id = $1
       ORDER BY bri.created_at DESC`,
      [reseller_id]
    );

    res.json({
      reseller: reseller.rows[0],
      items: items.rows,
      total_items: items.rows.length,
      total_owed: reseller.rows[0].open_balance
    });
  } catch (e) {
    console.error("Get credit book error:", e.message);
    res.status(500).json({ error: "Failed to load credit book" });
  }
});

// Bulk Reseller Payment
app.post("/bulk-resellers/:reseller_id/payment", authenticate, async (req, res) => {
  const err = validateRequiredFields(["amount"], req.body);
  if (err) return res.status(400).json({ error: err });

  const { reseller_id } = req.params;
  const { amount } = req.body;
  const paymentAmount = parseFloat(amount);

  if (paymentAmount <= 0) {
    return res.status(400).json({ error: "Payment amount must be greater than 0" });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const reseller = await client.query(
      "SELECT * FROM credit_customers WHERE id = $1 AND customer_type = 'bulk_reseller'",
      [reseller_id]
    );

    if (!reseller.rows.length) {
      throw new Error("Bulk reseller not found");
    }

    const previousBalance = parseFloat(reseller.rows[0].open_balance);
    
    // Can't pay more than owed
    const actualPayment = Math.min(paymentAmount, previousBalance);
    
    // Clamp at 0
    const newBalance = Math.max(0, previousBalance - actualPayment);

    // Record payment
    const paymentResult = await client.query(
      `INSERT INTO bulk_reseller_payments (reseller_id, amount)
       VALUES ($1, $2) RETURNING id, created_at`,
      [reseller_id, actualPayment]
    );

    // Update balance
    await client.query(
      "UPDATE credit_customers SET open_balance = $1 WHERE id = $2",
      [newBalance, reseller_id]
    );

    await client.query("COMMIT");

    res.json({
      message: "Payment recorded successfully",
      payment_id: paymentResult.rows[0].id,
      amount_paid: actualPayment,
      previous_balance: previousBalance,
      balance_left: newBalance,
      receipt_url: `/receipt/bulk-reseller-payment/${paymentResult.rows[0].id}`
    });
  } catch (e) {
    await client.query("ROLLBACK");
    console.error("Bulk reseller payment error:", e.message);
    res.status(500).json({ error: e.message });
  } finally {
    client.release();
  }
});

// Bulk Reseller Payment Receipt
app.get("/receipt/bulk-reseller-payment/:payment_id", async (req, res) => {
  try {
    const { payment_id } = req.params;

    const payment = await pool.query(
      `SELECT brp.*, cc.name AS reseller_name, cc.contact_info AS reseller_phone, cc.open_balance
       FROM bulk_reseller_payments brp
       JOIN credit_customers cc ON cc.id = brp.reseller_id
       WHERE brp.id = $1`,
      [payment_id]
    );

    if (!payment.rows.length) {
      return res.status(404).json({ error: "Payment not found" });
    }

    const p = payment.rows[0];

    const paymentData = {
      payment_id: p.id,
      payment_date: p.created_at,
      reseller_name: p.reseller_name,
      reseller_phone: p.reseller_phone,
      amount_paid: p.amount,
      previous_balance: parseFloat(p.open_balance) + parseFloat(p.amount),
      balance_left: p.open_balance
    };

    generateBulkResellerPaymentReceipt(paymentData, res);
  } catch (e) {
    console.error("Bulk reseller payment receipt error:", e.message);
    res.status(500).json({ error: "Failed to generate receipt" });
  }
});

// MANUAL BALANCE CORRECTION FOR BULK RESELLER (ADMIN ONLY)
app.post("/bulk-resellers/:reseller_id/correct-balance", authenticate, authorizeAdmin, async (req, res) => {
  const err = validateRequiredFields(["new_balance"], req.body);
  if (err) return res.status(400).json({ error: err });

  const { reseller_id } = req.params;
  const { new_balance, reason } = req.body;

  try {
    const reseller = await pool.query(
      "SELECT * FROM credit_customers WHERE id = $1 AND customer_type = 'bulk_reseller'",
      [reseller_id]
    );

    if (!reseller.rows.length) {
      return res.status(404).json({ error: "Bulk reseller not found" });
    }

    const previousBalance = parseFloat(reseller.rows[0].open_balance);
    const correctedBalance = Math.max(0, parseFloat(new_balance));

    await pool.query(
      "UPDATE credit_customers SET open_balance = $1 WHERE id = $2",
      [correctedBalance, reseller_id]
    );

    res.json({
      message: "Balance corrected successfully",
      reseller_name: reseller.rows[0].name,
      previous_balance: previousBalance,
      new_balance: correctedBalance,
      reason: reason || "Manual correction"
    });
  } catch (e) {
    console.error("Balance correction error:", e.message);
    res.status(500).json({ error: e.message });
  }
});

// RECALCULATE BULK RESELLER BALANCE FROM CREDIT BOOK (ADMIN ONLY)
app.post("/bulk-resellers/:reseller_id/recalculate-balance", authenticate, authorizeAdmin, async (req, res) => {
  const { reseller_id } = req.params;

  try {
    const reseller = await pool.query(
      "SELECT * FROM credit_customers WHERE id = $1 AND customer_type = 'bulk_reseller'",
      [reseller_id]
    );

    if (!reseller.rows.length) {
      return res.status(404).json({ error: "Bulk reseller not found" });
    }

    // Calculate what the balance SHOULD be based on credit book items
    const itemsTotal = await pool.query(
      "SELECT COALESCE(SUM(given_price), 0) AS total FROM bulk_reseller_items WHERE reseller_id = $1",
      [reseller_id]
    );

    // Calculate total payments made
    const paymentsTotal = await pool.query(
      "SELECT COALESCE(SUM(amount), 0) AS total FROM bulk_reseller_payments WHERE reseller_id = $1",
      [reseller_id]
    );

    const itemsSum = parseFloat(itemsTotal.rows[0].total) || 0;
    const paymentsSum = parseFloat(paymentsTotal.rows[0].total) || 0;
    const correctBalance = Math.max(0, itemsSum - paymentsSum);

    const previousBalance = parseFloat(reseller.rows[0].open_balance);

    // Update to correct balance
    await pool.query(
      "UPDATE credit_customers SET open_balance = $1, total_purchases = $2 WHERE id = $3",
      [correctBalance, itemsSum, reseller_id]
    );

    res.json({
      message: "Balance recalculated successfully",
      reseller_name: reseller.rows[0].name,
      previous_balance: previousBalance,
      items_total: itemsSum,
      payments_total: paymentsSum,
      correct_balance: correctBalance
    });
  } catch (e) {
    console.error("Recalculate balance error:", e.message);
    res.status(500).json({ error: e.message });
  }
});

// =============================================================================
// SUPPLIER FAULT REPORT ROUTES
// =============================================================================

// Create Supplier Fault Report
app.post("/supplier-reports", authenticate, async (req, res) => {
  const err = validateRequiredFields(["supplier_name", "total_supplied", "good_units", "faults"], req.body);
  if (err) return res.status(400).json({ error: err });

  const { supplier_name, total_supplied, good_units, faults, notes } = req.body;

  try {
    const supplier = await getSupplierByName(supplier_name);
    if (!supplier) {
      return res.status(400).json({ error: "Supplier not found" });
    }

    if (!Array.isArray(faults)) {
      return res.status(400).json({ error: "Faults must be an array" });
    }

    const totalFaulty = faults.reduce((sum, f) => sum + (parseInt(f.count) || 0), 0);

    const result = await pool.query(
      `INSERT INTO supplier_fault_reports 
       (supplier_id, total_supplied, good_units, total_faulty, faults_breakdown, notes, reported_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id, created_at`,
      [supplier.id, total_supplied, good_units, totalFaulty, JSON.stringify(faults), notes || "", req.user.email]
    );

    res.json({
      message: "Supplier fault report created successfully",
      report_id: result.rows[0].id,
      summary: {
        total_supplied,
        good_units,
        total_faulty: totalFaulty,
        faults_breakdown: faults
      }
    });
  } catch (e) {
    console.error("Create supplier report error:", e.message);
    res.status(500).json({ error: "Failed to create supplier report" });
  }
});

// Get All Supplier Fault Reports
app.get("/supplier-reports", authenticate, async (req, res) => {
  try {
    const { supplier_name } = req.query;

    let query = `
      SELECT sfr.*, s.name AS supplier_name
      FROM supplier_fault_reports sfr
      JOIN suppliers s ON s.id = sfr.supplier_id
    `;
    const params = [];

    if (supplier_name) {
      const supplier = await getSupplierByName(supplier_name);
      if (supplier) {
        query += " WHERE sfr.supplier_id = $1";
        params.push(supplier.id);
      }
    }

    query += " ORDER BY sfr.created_at DESC";

    const result = await pool.query(query, params);
    res.json({ reports: result.rows });
  } catch (e) {
    console.error("Get supplier reports error:", e.message);
    res.status(500).json({ error: "Failed to load supplier reports" });
  }
});

// Get Single Supplier Fault Report
app.get("/supplier-reports/:report_id", authenticate, async (req, res) => {
  try {
    const { report_id } = req.params;

    const result = await pool.query(
      `SELECT sfr.*, s.name AS supplier_name, s.contact_info AS supplier_contact
       FROM supplier_fault_reports sfr
       JOIN suppliers s ON s.id = sfr.supplier_id
       WHERE sfr.id = $1`,
      [report_id]
    );

    if (!result.rows.length) {
      return res.status(404).json({ error: "Report not found" });
    }

    res.json({ report: result.rows[0] });
  } catch (e) {
    console.error("Get supplier report error:", e.message);
    res.status(500).json({ error: "Failed to load report" });
  }
});

// =============================================================================
// REPORTS ROUTES
// =============================================================================

// Daily Report
app.get("/reports/daily", authenticate, async (req, res) => {
  try {
    const { branch_name } = req.query;
    let branchFilter = "";
    const params = [];

    if (req.user.role === "sales") {
      branchFilter = "AND s.branch_id = $1";
      params.push(req.user.branch_id);
    } else if (branch_name) {
      const branch = await getBranchByName(branch_name);
      if (branch) {
        branchFilter = "AND s.branch_id = $1";
        params.push(branch.id);
      }
    }

    const result = await pool.query(
      `SELECT s.id AS sale_id, s.payment_type, s.customer_name, s.customer_phone, s.sales_note,
              DATE(s.created_at) AS sale_date, s.created_at,
              sn.product_name, sn.serial_number, sn.specifications, sn.cost_price,
              si.price AS sale_price, s.sold_by_email, b.name AS branch_name,
              (si.price - sn.cost_price) AS profit
       FROM sales s
       JOIN sale_items si ON si.sale_id = s.id
       JOIN serial_numbers sn ON sn.id = si.serial_number_id
       JOIN branches b ON b.id = s.branch_id
       WHERE DATE(s.created_at) = CURRENT_DATE AND s.is_voided = false ${branchFilter}
       ORDER BY s.created_at DESC`,
      params
    );

    const totals = result.rows.reduce(
      (acc, row) => {
        acc.total_cost += parseFloat(row.cost_price);
        acc.total_revenue += parseFloat(row.sale_price);
        acc.total_profit += parseFloat(row.profit);
        return acc;
      },
      { total_cost: 0, total_revenue: 0, total_profit: 0 }
    );

    res.json({ report_type: "DAILY", sales: result.rows, totals });
  } catch (e) {
    console.error("Daily report error:", e.message);
    res.status(500).json({ error: "Failed to generate daily report" });
  }
});

// Weekly Report
app.get("/reports/weekly", authenticate, async (req, res) => {
  try {
    const { branch_name } = req.query;
    let branchFilter = "";
    const params = [];

    if (req.user.role === "sales") {
      branchFilter = "AND s.branch_id = $1";
      params.push(req.user.branch_id);
    } else if (branch_name) {
      const branch = await getBranchByName(branch_name);
      if (branch) {
        branchFilter = "AND s.branch_id = $1";
        params.push(branch.id);
      }
    }

    const result = await pool.query(
      `SELECT s.id AS sale_id, s.payment_type, s.customer_name, s.customer_phone, s.sales_note,
              DATE(s.created_at) AS sale_date, s.created_at,
              sn.product_name, sn.serial_number, sn.specifications, sn.cost_price,
              si.price AS sale_price, s.sold_by_email, b.name AS branch_name,
              (si.price - sn.cost_price) AS profit
       FROM sales s
       JOIN sale_items si ON si.sale_id = s.id
       JOIN serial_numbers sn ON sn.id = si.serial_number_id
       JOIN branches b ON b.id = s.branch_id
       WHERE s.created_at >= CURRENT_DATE - INTERVAL '7 days' AND s.is_voided = false ${branchFilter}
       ORDER BY s.created_at DESC`,
      params
    );

    const totals = result.rows.reduce(
      (acc, row) => {
        acc.total_cost += parseFloat(row.cost_price);
        acc.total_revenue += parseFloat(row.sale_price);
        acc.total_profit += parseFloat(row.profit);
        return acc;
      },
      { total_cost: 0, total_revenue: 0, total_profit: 0 }
    );

    res.json({ report_type: "WEEKLY", sales: result.rows, totals });
  } catch (e) {
    console.error("Weekly report error:", e.message);
    res.status(500).json({ error: "Failed to generate weekly report" });
  }
});

// Monthly Report
app.get("/reports/monthly", authenticate, async (req, res) => {
  const err = validateRequiredFields(["month", "year"], req.query);
  if (err) return res.status(400).json({ error: err });

  try {
    const { month, year, branch_name } = req.query;
    let branchFilter = "";
    const params = [month, year];

    if (req.user.role === "sales") {
      branchFilter = "AND s.branch_id = $3";
      params.push(req.user.branch_id);
    } else if (branch_name) {
      const branch = await getBranchByName(branch_name);
      if (branch) {
        branchFilter = "AND s.branch_id = $3";
        params.push(branch.id);
      }
    }

    const result = await pool.query(
      `SELECT s.id AS sale_id, s.payment_type, s.customer_name, s.customer_phone, s.sales_note,
              DATE(s.created_at) AS sale_date, s.created_at,
              sn.product_name, sn.serial_number, sn.specifications, sn.cost_price,
              si.price AS sale_price, s.sold_by_email, b.name AS branch_name,
              (si.price - sn.cost_price) AS profit
       FROM sales s
       JOIN sale_items si ON si.sale_id = s.id
       JOIN serial_numbers sn ON sn.id = si.serial_number_id
       JOIN branches b ON b.id = s.branch_id
       WHERE EXTRACT(MONTH FROM s.created_at) = $1 
         AND EXTRACT(YEAR FROM s.created_at) = $2 
         AND s.is_voided = false ${branchFilter}
       ORDER BY s.created_at DESC`,
      params
    );

    const totals = result.rows.reduce(
      (acc, row) => {
        acc.total_cost += parseFloat(row.cost_price);
        acc.total_revenue += parseFloat(row.sale_price);
        acc.total_profit += parseFloat(row.profit);
        return acc;
      },
      { total_cost: 0, total_revenue: 0, total_profit: 0 }
    );

    res.json({ report_type: "MONTHLY", month, year, sales: result.rows, totals });
  } catch (e) {
    console.error("Monthly report error:", e.message);
    res.status(500).json({ error: "Failed to generate monthly report" });
  }
});

// Yearly Report
app.get("/reports/yearly", authenticate, async (req, res) => {
  const err = validateRequiredFields(["year"], req.query);
  if (err) return res.status(400).json({ error: err });

  try {
    const { year, branch_name } = req.query;
    let branchFilter = "";
    const params = [year];

    if (req.user.role === "sales") {
      branchFilter = "AND s.branch_id = $2";
      params.push(req.user.branch_id);
    } else if (branch_name) {
      const branch = await getBranchByName(branch_name);
      if (branch) {
        branchFilter = "AND s.branch_id = $2";
        params.push(branch.id);
      }
    }

    const result = await pool.query(
      `SELECT s.id AS sale_id, s.payment_type, s.customer_name, s.customer_phone, s.sales_note,
              DATE(s.created_at) AS sale_date, s.created_at,
              sn.product_name, sn.serial_number, sn.specifications, sn.cost_price,
              si.price AS sale_price, s.sold_by_email, b.name AS branch_name,
              (si.price - sn.cost_price) AS profit
       FROM sales s
       JOIN sale_items si ON si.sale_id = s.id
       JOIN serial_numbers sn ON sn.id = si.serial_number_id
       JOIN branches b ON b.id = s.branch_id
       WHERE EXTRACT(YEAR FROM s.created_at) = $1 AND s.is_voided = false ${branchFilter}
       ORDER BY s.created_at DESC`,
      params
    );

    const totals = result.rows.reduce(
      (acc, row) => {
        acc.total_cost += parseFloat(row.cost_price);
        acc.total_revenue += parseFloat(row.sale_price);
        acc.total_profit += parseFloat(row.profit);
        return acc;
      },
      { total_cost: 0, total_revenue: 0, total_profit: 0 }
    );

    res.json({ report_type: "YEARLY", year, sales: result.rows, totals });
  } catch (e) {
    console.error("Yearly report error:", e.message);
    res.status(500).json({ error: "Failed to generate yearly report" });
  }
});

// Custom Date Range Report
app.get("/reports/custom", authenticate, async (req, res) => {
  const err = validateRequiredFields(["start_date", "end_date"], req.query);
  if (err) return res.status(400).json({ error: err });

  try {
    const { start_date, end_date, branch_name } = req.query;
    let branchFilter = "";
    const params = [start_date, end_date];

    if (req.user.role === "sales") {
      branchFilter = "AND s.branch_id = $3";
      params.push(req.user.branch_id);
    } else if (branch_name) {
      const branch = await getBranchByName(branch_name);
      if (branch) {
        branchFilter = "AND s.branch_id = $3";
        params.push(branch.id);
      }
    }

    const result = await pool.query(
      `SELECT s.id AS sale_id, s.payment_type, s.customer_name, s.customer_phone, s.sales_note,
              DATE(s.created_at) AS sale_date, s.created_at,
              sn.product_name, sn.serial_number, sn.specifications, sn.cost_price,
              si.price AS sale_price, s.sold_by_email, b.name AS branch_name,
              (si.price - sn.cost_price) AS profit
       FROM sales s
       JOIN sale_items si ON si.sale_id = s.id
       JOIN serial_numbers sn ON sn.id = si.serial_number_id
       JOIN branches b ON b.id = s.branch_id
       WHERE DATE(s.created_at) >= $1 AND DATE(s.created_at) <= $2 AND s.is_voided = false ${branchFilter}
       ORDER BY s.created_at DESC`,
      params
    );

    const totals = result.rows.reduce(
      (acc, row) => {
        acc.total_cost += parseFloat(row.cost_price);
        acc.total_revenue += parseFloat(row.sale_price);
        acc.total_profit += parseFloat(row.profit);
        return acc;
      },
      { total_cost: 0, total_revenue: 0, total_profit: 0 }
    );

    res.json({ report_type: "CUSTOM", start_date, end_date, sales: result.rows, totals });
  } catch (e) {
    console.error("Custom report error:", e.message);
    res.status(500).json({ error: "Failed to generate custom report" });
  }
});

// =============================================================================
// CREDIT PAYMENTS REPORT ROUTE
// =============================================================================

// Get All Credit Payments (Credit Customers + Bulk Resellers)
app.get("/reports/credit-payments", authenticate, async (req, res) => {
  try {
    const { start_date, end_date, branch_name } = req.query;
    
    let branchFilter = "";
    const params = [];
    let paramIndex = 1;

    if (start_date && end_date) {
      params.push(start_date, end_date);
      paramIndex = 3;
    }

    if (req.user.role === "sales") {
      branchFilter = start_date ? `AND s.branch_id = $${paramIndex}` : `WHERE s.branch_id = $1`;
      params.push(req.user.branch_id);
    } else if (branch_name) {
      const branch = await getBranchByName(branch_name);
      if (branch) {
        branchFilter = start_date ? `AND s.branch_id = $${paramIndex}` : `WHERE s.branch_id = $1`;
        params.push(branch.id);
      }
    }

    // Credit Customer Payments
    let creditCustomerQuery = `
      SELECT 
        cp.id AS payment_id,
        cp.amount,
        cp.created_at AS payment_date,
        cp.sale_id,
        cc.name AS customer_name,
        cc.contact_info AS customer_phone,
        'credit_customer' AS payment_type,
        cc.customer_type,
        b.name AS branch_name
      FROM credit_payments cp
      JOIN credit_customers cc ON cc.id = cp.credit_customer_id
      JOIN sales s ON s.id = cp.sale_id
      JOIN branches b ON b.id = s.branch_id
    `;

    if (start_date && end_date) {
      creditCustomerQuery += ` WHERE DATE(cp.created_at) >= $1 AND DATE(cp.created_at) <= $2 ${branchFilter}`;
    } else if (branchFilter) {
      creditCustomerQuery += ` ${branchFilter}`;
    }

    creditCustomerQuery += ` ORDER BY cp.created_at DESC`;

    const creditPayments = await pool.query(creditCustomerQuery, params);

    // Bulk Reseller Payments
    let bulkResellerQuery = `
      SELECT 
        brp.id AS payment_id,
        brp.amount,
        brp.created_at AS payment_date,
        NULL AS sale_id,
        cc.name AS customer_name,
        cc.contact_info AS customer_phone,
        'bulk_reseller' AS payment_type,
        cc.customer_type,
        'N/A' AS branch_name
      FROM bulk_reseller_payments brp
      JOIN credit_customers cc ON cc.id = brp.reseller_id
    `;

    const bulkParams = [];
    if (start_date && end_date) {
      bulkResellerQuery += ` WHERE DATE(brp.created_at) >= $1 AND DATE(brp.created_at) <= $2`;
      bulkParams.push(start_date, end_date);
    }

    bulkResellerQuery += ` ORDER BY brp.created_at DESC`;

    const bulkPayments = await pool.query(bulkResellerQuery, bulkParams);

    // Combine and sort all payments
    const allPayments = [...creditPayments.rows, ...bulkPayments.rows].sort(
      (a, b) => new Date(b.payment_date) - new Date(a.payment_date)
    );

    // Calculate totals
    const totals = {
      total_payments: allPayments.length,
      total_amount: allPayments.reduce((sum, p) => sum + parseFloat(p.amount), 0),
      credit_customer_payments: creditPayments.rows.length,
      credit_customer_amount: creditPayments.rows.reduce((sum, p) => sum + parseFloat(p.amount), 0),
      bulk_reseller_payments: bulkPayments.rows.length,
      bulk_reseller_amount: bulkPayments.rows.reduce((sum, p) => sum + parseFloat(p.amount), 0)
    };

    res.json({
      report_type: "CREDIT_PAYMENTS",
      start_date: start_date || "All time",
      end_date: end_date || "All time",
      payments: allPayments,
      totals
    });
  } catch (e) {
    console.error("Credit payments report error:", e.message);
    res.status(500).json({ error: "Failed to generate credit payments report" });
  }
});

// =============================================================================
// SEARCH ROUTE
// =============================================================================

app.get("/search", authenticate, async (req, res) => {
  try {
    const { q } = req.query;
    if (!q || q.trim() === "") {
      return res.status(400).json({ error: "Search query required" });
    }

    const searchTerm = `%${q}%`;
    const results = { laptops: [], customers: [], branches: [], suppliers: [] };

    // Search laptops
    let laptopQuery = `SELECT DISTINCT product_name FROM serial_numbers WHERE product_name ILIKE $1`;
    const laptopParams = [searchTerm];

    if (req.user.role === "sales") {
      laptopQuery += " AND branch_id = $2";
      laptopParams.push(req.user.branch_id);
    }

    laptopQuery += " LIMIT 10";
    const laptops = await pool.query(laptopQuery, laptopParams);
    results.laptops = laptops.rows.map((r) => r.product_name);

    // Admin can search everything
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
      results.branches = branches.rows.map((r) => r.name);

      const suppliers = await pool.query(
        "SELECT name FROM suppliers WHERE name ILIKE $1 LIMIT 10",
        [searchTerm]
      );
      results.suppliers = suppliers.rows.map((r) => r.name);
    }

    res.json(results);
  } catch (e) {
    console.error("Search error:", e.message);
    res.status(500).json({ error: "Search failed" });
  }
});

// =============================================================================
// ROOT ROUTE (Health Check)
// =============================================================================

app.get("/", async (req, res) => {
  try {
    const result = await pool.query("SELECT NOW()");
    res.json({
      status: "OK",
      message: "JIMAS Computers API is running",
      database: "Connected",
      server_time: result.rows[0].now
    });
  } catch (e) {
    res.json({
      status: "OK",
      message: "JIMAS Computers API is running",
      database: "Not connected",
      error: e.message
    });
  }
});

// =============================================================================
// TEMPORARY: PASSWORD HASH GENERATOR (DELETE AFTER USE)
// =============================================================================
app.get("/hash/:password", async (req, res) => {
  try {
    const password = req.params.password;
    const hash = await bcrypt.hash(password, 10);
    res.json({
      original_password: password,
      hashed_password: hash,
      instruction: "Copy the hashed_password and use it in your database INSERT statement"
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// =============================================================================
// START SERVER
// =============================================================================

app.listen(PORT, () => {
  console.log(`✅ JIMAS Computers API running on port ${PORT}`);
});