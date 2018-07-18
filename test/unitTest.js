"use strict" 

const helper = require('./../index').apiHelper;

const customVerifyJws = require('./customVerifyJws').customVerifyJws;
const customVerifyJwe = require('./customVerifyJwe').customVerifyJwe;

//let params = require('./sample.json');
//let params = require('./sample.repeats.json');
//let params = require('./paramTest.json');
//let params = require('./hedwig.json');
//let params = require('./largeData.json');
//let params = require('./20kbData.json');
let params = require('./get6kbResponse.json');

// register verification function with helper library
// this supports verification function for each call
//helper.myVerifyJws = helper.verifyJws;
helper.myVerifyJws = customVerifyJws;
helper.myVerifyJwe = customVerifyJwe;

// to suppress the successfult message, will not suppress error message
helper.setDefaultParam({ suppressMessage: false, debug : true });

Promise.resolve()
    //.then(() => console.log(new Date()))
    .then(function() { return helper.startTestTimer() })
    //.then(function() { return helper.performTest(params, helper.verifyJws) })

    // sequential execution
    //.then(function() { return helper.performTest(params) })
    .then(function() { return helper.performTest(params) })

    // parallel execution
    /*
    .then(function() { return Promise.all([
        helper.performTest(params)
        , helper.performTest(params)
        , helper.performTest(params)
        , helper.performTest(params)
        , helper.performTest(params)
        , helper.performTest(params)
        , helper.performTest(params)
        , helper.performTest(params)
        , helper.performTest(params)
        , helper.performTest(params)
        , helper.performTest(params)
        , helper.performTest(params)
        , helper.performTest(params)
        , helper.performTest(params)
        , helper.performTest(params)
        , helper.performTest(params)
        , helper.performTest(params)
        , helper.performTest(params)
        , helper.performTest(params)
        , helper.performTest(params)
    ]) })
    */
    //.then(() => console.log(new Date()))

    .then(helper.displayTestResult).then(message => console.log("\n" + message))
    .then(helper.displayElapseTime).then(message => console.log("\n" + message + "\n"))
    .catch(function(error) { 
        console.log(error);
    })
;