"use strict" 

const helper = require('./../index').apiHelper;

let params = require('./sample.json');
//let params = require('./sample.repeats.json');

// register verification function with helper library
// this supports verification function for each call
helper.myVerifyJws = helper.verifyJws;
helper.myVerifyJwe = helper.verifyJwe;

Promise.resolve()
    .then(function() { return helper.performTest(params) })

    .then(helper.displayTestResult).then(message => console.log("\n" + message))
    .catch(function(error) { 
        console.log(error);
    })
;