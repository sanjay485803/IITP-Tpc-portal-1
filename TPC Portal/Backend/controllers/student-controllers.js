const fs = require("fs");
const mongoose = require("mongoose");
const { validationResult } = require("express-validator");
const HttpError = require("../models/http-error");
const Student = require("../models/students");
const Admin = require("../models/admin");
const StudentJob = require("../models/studentjobs");
const Job = require("../models/jobs");

const login = async (req, res, next) => {};

const registration = async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    console.log(errors);
    return next(new HttpError("You have entered invalid data , recheck", 422));
  }
  const {
    name,
    rollNo,
    gender,
    instituteEmail,
    personalEmail,
    mobileNumber,
    registrationFor,
    program,
    department,
    course,
    currentSemester,
    spi,
    cpi,
    tenthMarks,
    twelthMarks,
    bachelorsMarks,
    mastersMarks,
    password,
  } = req.body;

  let existingStudent;
  try {
    existingStudent = await Student.findOne({ rollNo: rollNo });
  } catch (err) {
    console.log(err);
    const error = new HttpError("SignUp Failed! try again later", 500);
    return next(error);
  }
  console.log(existingStudent);
  if (existingStudent) {
    const error = new HttpError("User already exist! login Instead", 422);
    return next(error);
  }

  const newStudent = new Student({
    studId: rollNo,
    name,
    rollNo,
    gender,
    instituteEmail,
    personalEmail,
    mobileNumber,
    registrationFor,
    program,
    department,
    course,
    currentSemester,
    spi,
    cpi,
    tenthMarks,
    twelthMarks,
    bachelorsMarks,
    mastersMarks,
    password,
    placement: {
      status: "unplaced",
      category: "",
    },
    approvalStatus: "PENDING APPROVAL",
  });
  //Logic of Image Upload
  newStudent.image = req.file
    ? "http://localhost:5000/" + req.file.path
    : "Still Not Uploaded";
  // Saving to Database
  try {
    const sess = await mongoose.startSession();
    sess.startTransaction();
    await newStudent.save({ session: sess });
    await Admin.updateOne(
      {},
      { $addToSet: { studentApproval: newStudent._id } }
    ).session(sess);
    await sess.commitTransaction();
  } catch (err) {
    console.log(err);
    const error = new HttpError("Something went wrong ! try again later", 500);
    return next(error);
  }
  res.json({ newStudent: newStudent.toObject({ getters: true }) });
};

const profile = async (req, res, next) => {
  const studentId = req.params.sid;
  let studentInfo = [];
  console.log(studentId);
  try {
    studentInfo = await Student.findOne(
      { _id: studentId },
      {
        name: 1,
        rollNo: 1,
        instituteEmail: 1,
        personalEmail: 1,
        gender: 1,
        mobileNumber: 1,
        registrationFor: 1,
        program: 1,
        department: 1,
        course: 1,
        currentSemester: 1,
        spi: 1,
        cpi: 1,
        tenthMarks: 1,
        twelthMarks: 1,
        bachelorsMarks: 1,
        mastersMarks: 1,
        approvalStatus: 1,
        image: 1,
      }
    );
  } catch (err) {
    console.log(err);
    const error = new HttpError("Something went wrong! Try again later", 500);
    return next(error);
  }
  res.json({ studentInfo: studentInfo });
};
const eligibleJobs = async (req, res, next) => {
  const studId = req.params.sid;
  console.log(studId);
  let eligibleJobs;
  try {
    eligibleJobs = await StudentJob.findOne({ studId: studId }).populate({
      path: "eligibleJobs",
      select: "companyName companyId jobTitle jobCategory jafFiles schedule",
    });
  } catch (err) {
    console.log(err);
    const error = new HttpError("Something went wrong! Try again later", 500);
    return next(error);
  }
  console.log(eligibleJobs);
  res.json({ studentJobs: eligibleJobs });
};

const applyForJob = async (req, res, next) => {
  const studId = req.params.sid;
  let newRegistration;
  const { jobId } = req.body;
  try {
    const sess = await mongoose.startSession();
    sess.startTransaction();
    let job = await Job.aggregate([
      {
        $project: {
          idString: { $toString: "$_id" },
          _id: 1,
        },
      },
      { $match: { idString: jobId } },
    ]);
    //console.log(job);
    if (!job) {
      return next(new HttpError("Job doesn't exist anymore", 404));
    }
    newRegistration = await Job.findById(job[0]._id).session(sess);
    newRegistration.registeredStudents.push(studId);
    await newRegistration.save({ session: sess });
    await StudentJob.updateOne(
      { studId: studId },
      {
        $pull: { eligibleJobs: { $in: [jobId] } },
        $addToSet: { appliedJobs: { jobId: jobId, jobStatus: "applied" } },
      }
    ).session(sess);
    const student = await Student.findById(studId).session(sess);
    if (student.placement.status === "placed") {
      let count = job.jobCategory;
      count += "count";
      student.placement.applicationCount[count] += 1;
    }
    await student.save({ session: sess });
    await sess.commitTransaction();
  } catch (err) {
    console.log(err);
    const error = new HttpError("Something went wrong! Try again later", 500);
    return next(error);
  }
  res.json({
    job: newRegistration,
  });
};

const appliedJobs = async (req, res, next) => {
  const studId = req.params.sid;
  let appliedJobs;
  try {
    appliedJobs = await StudentJob.findOne(
      { studId: studId },
      { studId: 1, _id: 0, "appliedJobs.jobStatus": 1 }
    ).populate({
      path: "appliedJobs.jobId",
      select: "companyName jobTitle jobCategory schedule",
    });
  } catch (err) {
    console.log(err);
    const error = new HttpError("Something went wrong! Try again later", 500);
    return next(error);
  }
  res.json({ studentWithAppliedJobs: appliedJobs });
};

const requests = async (req, res, next) => {
  const studId = req.params.sid;
  let oldRequests;
  try {
    oldRequests = await Student.findOne(
      { _id: studId },
      { studId: 1, requests: 1 }
    );
  } catch (err) {
    console.log(err);
    const error = new HttpError("Something went wrong! Try again later", 500);
    return next(error);
  }
  res.json({ oldRequests: oldRequests });
};

const newRequest = async (req, res, next) => {
  const studId = req.params.sid;

  let studentInfo;
  try {
    studentInfo = await Student.findById(studId);
  } catch (err) {
    console.log(err);
    const error = new HttpError("Something went wrong! Try again later", 500);
    return next(error);
  }
  if (!studentInfo) {
    return next(new HttpError("User not found", 404));
  }
  Student.findByIdAndUpdate(req.params.sid, req.body, (error, data) => {
    if (error) {
      return next(error);
      console.log(error);
    } else {
      res.json(data);
      console.log("User updated successfully !");
    }
  });
  try {
    const sess = await mongoose.startSession();
    sess.startTransaction();
    await studentInfo.save({ session: sess });
    await Admin.updateOne(
      {},
      {
        $addToSet: {
          studentRequests: {
            studId: studentInfo._id,
            subject: subject,
            content: message,
            requestStatus: "unread",
          },
        },
      }
    ).session(sess);
    await sess.commitTransaction();
  } catch (err) {
    console.log(err);
    const error = new HttpError("Something went wrong! Try again later", 500);
    return next(error);
  }
  res.json({ studentInfo: studentInfo.toObject() });
};

const resumeUpload = async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    console.log(errors);
    return next(new HttpError("You have entered invalid data , recheck", 422));
  }
  const studentId = req.params.sid;
  console.log(studentId);
  const { resumeLink } = req.body;
  const resumeFile = "http://localhost:5000/" + req.file.path;
  let studentInfo;
  try {
    studentInfo = await Student.findOne({ _id: studentId });
  } catch (err) {
    console.log(err);
    const error = new HttpError("Something went wrong! Try again later", 500);
    return next(error);
  }
  console.log(studentInfo);
  if (!studentInfo) {
    const error = new HttpError("User not Found", 404);
    return next(error);
  }
  // Deleting previous file if any from our server
  if (studentInfo.resumeFile) {
    const path = studentInfo.resumeFile.split("/localhost:5000/")[1];
    fs.unlink(path, (err) => {
      console.log(err);
    });
  }
  studentInfo.resumeFile = resumeFile;
  studentInfo.resumeLink = resumeLink;

  try {
    await studentInfo.save();
  } catch (err) {
    console.log(err);
    const error = new HttpError("Something went wrong! Try again later", 500);
    return next(error);
  }
  res.json({
    resumeDetails: { resumeFile: resumeFile, resumeLink: resumeLink },
  });
};

const resetPassword = async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    console.log(errors);
    return next(new HttpError("You have entered invalid data , recheck", 422));
  }
  const studentId = req.params.sid;
  const { oldPassword, newPassword, rollNo } = req.body;
  try {
    existingStudent = await Student.findOne({ rollNo: rollNo });
  } catch (err) {
    console.log(err);
    const error = new HttpError("Something went wrong! Try again later", 500);
    return next(error);
  }
  if (!existingStudent) {
    console.log(err);
    const error = new HttpError("User not found", 404);
    return next(error);
  }
  if (oldPassword === existingStudent.password)
    existingStudent.password = newPassword;
  try {
    await existingStudent.save();
  } catch (err) {
    console.log(err);
    const error = new HttpError("Something went wrong! Try again later", 500);
    return next(error);
  }
  res.json({ message: "Password Reset", newPassword: newPassword });
};

exports.login = login;
exports.registration = registration;
exports.profile = profile;
exports.applyForJob = applyForJob;
exports.appliedJobs = appliedJobs;
exports.eligibleJobs = eligibleJobs;
exports.requests = requests;
exports.newRequest = newRequest;
exports.resumeUpload = resumeUpload;
exports.resetPassword = resetPassword;
