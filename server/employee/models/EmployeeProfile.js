import mongoose from "mongoose";

// Employees entered by hand on the admin app's Add Employee page, with the
// HR joining sheet's details. Kept apart from `employees` (the COSEC copy of
// ID, name and department that dailyRegister/cosecSync.js rewrites), so the sync
// never touches what an admin typed.
const text = { type: String, default: "" };

const employeeProfileSchema = new mongoose.Schema(
  {
    employeeId: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    // BC365 Initials No.: the Pay Sheet rows' key for this employee.
    initialsNo: text,
    department: text,
    // Picked from the Department tab's list (department -> sub department).
    subDepartment: text,
    designation: text,
    employeeRole: text, // "Employee", "Manager" or "Admin" (Add Employee dropdown)
    // Every department worked in, oldest first; a department transfer closes
    // the current spell the day before its effective date ("DD-MM-YYYY").
    departmentHistory: [
      {
        _id: false,
        department: text,
        subDepartment: text,
        designation: text,
        reportingManager: text,
        from: text,
        to: text,
        remark: text,
        kind: text // "rejoin" for the spell a Rejoin opens, else ""
      }
    ],
    reportingManager: text,
    joiningDate: text, // "DD-MM-YYYY"
    salaryType: text, // "Salary" or "Wages" (Add Employee dropdown)
    employmentType: text, // Permanent, Contract, Trainee or Probation
    confirmationDate: text, // "DD-MM-YYYY": probation end / confirmation
    workLocation: text, // company unit / work location
    weeklyOff: text, // "Sunday" ... "Saturday"
    uanNo: text, // PF UAN, 12 digits
    esicNo: text, // ESIC IP number, 10 digits
    yearlyCtc: { type: Number, default: null },
    monthlyCtc: { type: Number, default: null },
    state: text, // where they work now: the last stateHistory entry's
    // Every state worked in, oldest first; a Transfer closes the current stay
    // the day before its effective date and opens the next ("DD-MM-YYYY").
    stateHistory: [
      { _id: false, state: text, city: text, from: text, to: text, remark: text, kind: text }
    ],
    pfApplicable: { type: Boolean, default: null },
    esicApplicable: { type: Boolean, default: null },
    // Every pay the employee has been on, oldest first, kept like the state
    // history: a Salary revision (or a department transfer with a new CTC)
    // closes the current entry the day before its effective date. kind:
    // "joining", "revision", "department" or "rejoin".
    payHistory: [
      {
        _id: false,
        monthlyCtc: { type: Number, default: null },
        pfApplicable: { type: Boolean, default: null },
        esicApplicable: { type: Boolean, default: null },
        kind: text,
        from: text,
        to: text,
        remark: text
      }
    ],
    // Every time the employee left, oldest first. An Exit closes the state,
    // department and pay histories on lastWorkingDay; a Rejoin sets
    // rejoinDate and opens them again. Never deleted except by Undo exit.
    exits: [
      {
        _id: false,
        exitType: text, // Resigned, Terminated, Retired, Absconding, Death, Contract end
        resignationDate: text, // "DD-MM-YYYY", may be blank
        lastWorkingDay: text, // "DD-MM-YYYY"
        reason: text,
        noticeServed: text, // "Yes", "No" or "Waived"
        rehireEligible: { type: Boolean, default: null },
        remark: text,
        rejoinDate: text, // "DD-MM-YYYY" once rejoined, else ""
        rejoinRemark: text
      }
    ],
    otherBenefits: text,
    // Monthly split worked out from monthlyCtc at save (utils/salaryFormulas.js).
    salary: {
      basic: Number,
      hra: Number,
      specialAllowance: Number,
      statutoryBonus: Number,
      esicEmployee: Number,
      esicEmployer: Number,
      pfEmployee: Number,
      pfEmployer: Number,
      professionalTax: Number,
      inHand: Number
    },

    aadhaarNo: text,
    pan: text,
    otherId: { type: { type: String, default: "" }, number: text },
    mobile: text,
    emergencyContact: { name: text, phone: text, relation: text },
    address: { line: text, city: text, state: text, pin: text, country: text },
    // "Yes" when the permanent address is the same as the current one (the
    // form then copies address into permanentAddress on save).
    permanentSameAsCurrent: text,
    permanentAddress: { line: text, city: text, state: text, pin: text, country: text },

    bank: { bankName: text, accountNo: text, ifscCode: text },

    shift: { in: text, out: text }, // "HH:mm"

    // Add Employee > Documents: files kept in server/uploads/employees/<employeeId>/
    // (employee/employeeDocuments.js).
    documents: [
      {
        _id: false,
        id: text,
        title: text, // "Aadhaar card", "PAN card", ...
        fileName: text, // EmpCode_EmpName_DocName.pdf, also its name on disk
        originalName: text, // the name it was uploaded with
        mimeType: text, // application/pdf, image/jpeg or image/png
        size: Number,
        uploadedAt: Date
      }
    ]
  },
  {
    timestamps: true,
    collection: "employee_profiles"
  }
);

export default mongoose.model("EmployeeProfile", employeeProfileSchema);
