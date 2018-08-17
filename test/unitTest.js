"use strict" 

const helper = require('./../index').apiHelper;

const customVerifyJws = require('./customVerifyJws').customVerifyJws;
const customVerifyJwe = require('./customVerifyJwe').customVerifyJwe;
const customVerifyJweJws = require('./customVerifyJwe').customVerifyJweJws;

let params = require('./json/sample.json');

// register verification function with helper library
// this supports verification function for each call
// default implementation
//helper.myVerifyJws = helper.verifyJws;
//helper.myVerifyJwe = helper.verifyJwe;
// custom implementation
helper.myVerifyJws = customVerifyJws;
helper.myVerifyJwe = customVerifyJwe;
helper.myVerifyJweJws = customVerifyJweJws;

// to suppress the successfult message, will not suppress error message
helper.setDefaultParam({ suppressMessage: false, debug : false, showElapseTime: false });

Promise.resolve()
    .then(function() { return helper.startTestTimer() })

    .then(function() { return helper.performTest(params) })

    .then(helper.displayTestResult).then(message => console.log("\n" + message))
    .then(helper.displayElapseTime).then(message => console.log("\n" + message + "\n"))
    .catch(function(error) { 
        console.log(error);
    })
;