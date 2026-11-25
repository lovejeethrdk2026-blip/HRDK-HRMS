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
    gender: text, // "Male", "Female" or "Other"
    salutation: text, // "Mr.", "Ms.", "Mrs." or "Mx." (fits the gender)
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
    // Pay version (Pay Formulas) the current pay is worked out with; "" = the
    // first version (utils/salaryFormulas.js withPayVersion).
    payVersion: text,
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
        payVersion: text, // pay version this pay is worked out with ("" = the first)
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
    address: { line: text, city: text, district: text, state: text, pin: text, country: text },
    // "Yes" when the permanent address is the same as the current one (the
    // form then copies address into permanentAddress on save).
    permanentSameAsCurrent: text,
    permanentAddress: { line: text, city: text, district: text, state: text, pin: text, country: text },

    bank: { bankName: text, accountNo: text, ifscCode: text },

    shift: { in: text, out: text }, // "HH:mm"

    // Add Employee > Family. esicCovered is worked out on save
    // (familyEsicCovered in utils/salaryFormulas.js).
    family: [
      {
        _id: false,
        relation: text, // Father, Mother, Spouse or Child
        name: text,
        dob: text, // "DD-MM-YYYY"
        esicCovered: { type: Boolean, default: false }
      }
    ],

    // Add Employee > PF nominee: who gets the PF if the employee dies, and
    // what % (all nominees together 100).
    pfNominees: [
      {
        _id: false,
        relation: text, // Father, Mother, Wife, Husband, Son, Daughter, Brother, Sister, Other
        name: text,
        dob: text, // "DD-MM-YYYY"
        gender: text, // Male, Female, Other
        pfShare: { type: Number, default: 0 },
        aadhaar: text,
        mobile: text,
        sameAddress: { type: Boolean, default: true }, // same as the employee's address
        address: text,
        bank: { bankName: text, accountNo: text, ifscCode: text },
        guardian: { name: text, relation: text } // when the nominee is a minor
      }
    ],

    // Add Employee > Documents: files kept in Google Drive (hrdk-hrms/<code>_<NAME>/)
    // when connected, else in server/uploads/employees/<employeeId>/
    // (employee/employeeDocuments.js). driveFolderId: this employee's Drive folder.
    driveFolderId: text,
    // Employee app > My profile: the one correction the employee may make to
    // their own personal / contact / address / bank details (portal/profile.js).
    selfCorrection: {
      at: { type: Date, default: null },
      changes: [{ _id: false, path: text, before: text, after: text }]
    },
    // Document titles HR has locked for the employee app. Until HR locks a
    // document the employee may change it from the app as often as they like
    // (a new file replaces the old one). Set on Add Employee > Documents.
    appLockedDocs: { type: [String], default: [] },
    documents: [
      {
        _id: false,
        id: text,
        title: text, // "Aadhaar card", "PAN card", ...
        fileName: text, // 10001_RISHIKA_SONI_Aadhaar_Card.pdf, its name in Drive (or on disk)
        driveFileId: text, // set when the file is in Google Drive, empty when on disk
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
