const bcrypt = require("bcryptjs");

// ===========================================
// CHANGE THIS TO YOUR DESIRED ADMIN PASSWORD
// ===========================================
const myPassword = "Admin1234";

// Hash the password
async function hashPassword() {
  const salt = await bcrypt.genSalt(10);
  const hashedPassword = await bcrypt.hash(myPassword, salt);
  
  console.log("");
  console.log("===========================================");
  console.log("PASSWORD HASHING COMPLETE");
  console.log("===========================================");
  console.log("");
  console.log("Your original password:", myPassword);
  console.log("");
  console.log("Your hashed password:");
  console.log(hashedPassword);
  console.log("");
  console.log("===========================================");
  console.log("NEXT STEP: Copy the hashed password above");
  console.log("and replace it in your schema.sql file");
  console.log("===========================================");
  console.log("");
}

hashPassword();