"use strict" 

const helper = require('./../index').apiHelper;
const joseVerify = require('./joseVerify');

let params_sample = require('./sample.json');
let params_security = require('./sample.security.json');

// register verification function with helper library
// this supports verification function for each call
// default implementation
helper.myVerifyJws = joseVerify.verifyJws;
helper.myVerifyJwe = joseVerify.verifyJwe;
helper.myVerifyJweJws = joseVerify.verifyJweJws;

helper.setDefaultParam({
    // suppress the successful message, will not suppress error message is any
    suppressMessage: false,
    // display verbose debug message
    debug: false,
    // show execution time
    showElapseTime: false,
    // skip a test
    skipTest: false
});

Promise.resolve()
    .then(function() { return helper.startTestTimer() })

    .then(function() { return helper.performTest(params_sample) })
    .then(function() { return helper.performTest(params_security) })

    .then(helper.displayTestResult).then(message => console.log("\n" + message))
    .then(helper.displayElapseTime).then(message => console.log("\n" + message + "\n"))
    .catch(function(error) { 
        console.log(error);
    })
;