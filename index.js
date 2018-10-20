"use strict" 

const crypto = require('crypto');
const request = require('superagent');
const fs = require('fs');
const promise = require('bluebird');
const qs = require('querystring');
const { URL } = require('url');

const _ = require("lodash");

const apex = require('node-apex-api-security').ApiSigningUtil;
const dateFormat = require('./timestamp').dateFormat;

var totalTest = 0;
var passedTest = 0;
var skipTest = 0;

let util = {};

function nonceLib() {
    return crypto.randomBytes(32).toString('base64');
}

util.invokeRequest = (param) => {
    return new promise(function(resolve, reject){
        process.env.NODE_TLS_REJECT_UNAUTHORIZED = "1";
        if (param.ignoreServerCert == undefined || param.ignoreServerCert)
            process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

        const targetURL = new URL(param.invokeUrl);

        // construct query string
        if (param.queryString != undefined) {
            targetURL.search = qs.stringify(param.queryString, null, null, {encodeURIComponent: encodeURIComponent}) + targetURL.search.replace('?', '&');
        }

        let req = request(param.httpMethod, targetURL.href);

        req.buffer(true);

        if (param.caCertFileName != undefined){
            //req.ca(fs.readFileSync(param.caCertFileName, "utf8"));
            req.ca(fs.readFileSync(param.caCertFileName));
        }

        if (param.signature != undefined && param.signature.length > 0) {
            req = req.set("Authorization", param.signature);
        }

        if (param.testTag != undefined && param.testTag) {
            req = req.set("NODE-Test-Tag", param.id + ". " + param.description);
        }
    
        if (param.httpHeaders != undefined) {
            // Iterate through properties of headers
            for (let key in param.httpHeaders) {
                req = req.set(key, param.httpHeaders[key]);
            }
        }

        if ((param.httpMethod == "POST" || param.httpMethod == "PUT") && param.formData != undefined) {
            let postData = qs.stringify(param.formData, null, null, {encodeURIComponent: encodeURIComponent});
            req = req.type("application/x-www-form-urlencoded").set("Content-Length", Buffer.byteLength(postData)).send(postData);
        }

        if ((param.httpMethod == "POST" || param.httpMethod == "PUT") && param.jsonData != undefined) {
            if (param.base64Data != undefined) {
                let buff = fs.readFileSync(param.base64Data.dataFileName);  
                let base64data = buff.toString('base64');
                param.jsonData[param.base64Data.fieldName] = base64data;
            }

            let postData = JSON.stringify(param.jsonData);
            req = req.type("application/json").send(postData);
        }

        if ((param.httpMethod == "POST" || param.httpMethod == "PUT") && param.textData != undefined) {
            let postData = param.textData.data

            if (param.textData.dataFileName != undefined)
                postData = fs.readFileSync(param.textData.dataFileName, "utf8")

            req = req.type(param.textData.contentType).send(postData);
        }

        if ((param.httpMethod == "POST" || param.httpMethod == "PUT") && param.binaryData != undefined) {
            let postData = null;

            if (param.binaryData.dataFileName != undefined)
                postData = fs.readFileSync(param.binaryData.dataFileName)

            req = req.type(param.binaryData.contentType).send(postData);
        }

        // handle multiPartData POST request
        if (param.multiPartData != undefined) {
            if (param.multiPartData.fields != undefined) {
                for (let key in param.multiPartData.fields) {
                    req = req.field(key, param.multiPartData.fields[key]);
                }
            }

            if (param.multiPartData.attachments != undefined) {
                for (let key in param.multiPartData.attachments) {
                    if (Array.isArray(param.multiPartData.attachments[key])) {
                        _.forEach(param.multiPartData.attachments[key], function(paramValue) { 
                            // trigger error if file not found...
                            // req.attach does not propagate error
                            fs.readFileSync(paramValue);

                            req = req.attach("files", paramValue);
                        });
                    } else {
                        // trigger error if file not found...
                        // req.attach does not propagate error
                        fs.readFileSync(param.multiPartData.attachments[key]);

                        req = req.attach(key, param.multiPartData.attachments[key]);
                    }
                }
            }

            req = req.type("multipart/form-data");
        }

        param.startTime = new Date();
        req.then(function(res) {
            param.timespan = param.startTime.timespan();
            resolve(res);
        })
        .catch(function(err) {
            param.timespan = param.startTime.timespan();
            reject(err);
        });
    });
}

util.performTest = (params) => {
    //console.log( "Entering recursive function for [", params.length, "]." );
    
    var testFunction = util.executeTest;

    // Once we hit zero, bail out of the recursion. The key to recursion is that
    // it stops at some point, and the callstack can be "rolled" back up.
    if ( params.length === 0 ) {
        return( Promise.resolve() );
    }
    
    var item = params;
    var newParams = [];

    if (Array.isArray(params)){
        // clone the parameter array, may not work if consists of object reference
        var cloneParams = JSON.parse(JSON.stringify(params));

        // split the array to first item and the rest of the array
        item = cloneParams.splice(0,1)[0];
        newParams = cloneParams.splice(0);
    }

    var tangentialPromiseBranch = undefined;

    //parallel execution of call
    if(item.parallel != undefined && item.parallel > 1) {
        var parallel = item.parallel;
        item.parallel = undefined;

        var functionArray = [];
        var itemJson = JSON.stringify(item);

        for (var i = 0; i < parallel; i++) {
            var newItem = JSON.parse(itemJson);

            if (newItem.queryString == undefined) newItem.queryString = {};

            newItem.id += " parallel=" + i;
            newItem.queryString.llid = require('uuid/v1')().substring(0,8);
            newItem.description += " llid=" + newItem.queryString.llid;

            functionArray.push(util.performTest(newItem));
        }

        tangentialPromiseBranch = Promise.all(functionArray);
    }
    else 
    {
        // Implement repeats call for parameter with repeats attribute
        if (item.repeats != undefined && item.repeats > 1){
            var repeats = item.repeats - 2;
            item.repeats = undefined;

            // assign uuid to first item
            if (item.queryString == undefined) item.queryString = {};

            var stringCopy = JSON.stringify(item);

            item.id += " repeat=1";
            item.queryString.uuid = require('uuid/v1')().substring(0,8);
            item.description += " uuid=" + item.queryString.uuid;

            var repeatedParam = "";
            if (repeats == 0) {
                // repeats 2 times, so just add 1 item
                repeatedParam = JSON.parse('[' + stringCopy + ']');
            } else {
                repeatedParam = JSON.parse('[' + (stringCopy + ',').repeat(repeats) + stringCopy + ']');
            }

            var repeatCounter = 1;

            // assign uuid to the rest
            _.forEach(repeatedParam, function(param) {
                param.id += " repeat=" + ++repeatCounter;
                param.queryString.uuid = require('uuid/v1')().substring(0,8); param.description += " uuid=" + param.queryString.uuid; 
            });

            newParams = _.concat(repeatedParam, newParams);
        }

        tangentialPromiseBranch = testFunction(item);
    }

    return(tangentialPromiseBranch.then(
        function() {
            return(util.performTest(newParams)); // RECURSE!
        }
    ));
}

util.displayTestResult = () => {
    return Promise.resolve("Test Results::: " + passedTest + "/" + totalTest + "\n   Skip Test::: " + skipTest);
}

var startDate;
util.startTestTimer = () => {
    startDate = new Date();
    return Promise.resolve();
}

util.displayElapseTime = () => {
    if (startDate == undefined) return Promise.resolve("Start timer not started!");

    var ts = startDate.timespan();

    var message = getElapseTime(startDate, ts);

    return Promise.resolve(message);
}

function showBaseString(param) {
    // get baseString
    let baseProps = {
        authPrefix: param.authPrefix.toLowerCase(),
        //signatureMethod: param.signatureMethod || "signatureMethod",
        signatureMethod: param.signatureMethod || _.isNil(param.secret) ? 'SHA256withRSA' : 'HMACSHA256',
        appId: param.appId,
        urlPath: param.signatureUrl,
        httpMethod: param.httpMethod,
        queryString: param.queryString || null,
        formData: param.formData || null,
        nonce: param.nonce || "nonce",
        timestamp: param.timestamp || "timestamp"
    };

    param.baseString = apex.getSignatureBaseString(baseProps);
}

util.getApexSecurityToken = (param) => {
    // no geteway security require...
    if (param.signatureUrl != undefined) {
        // patch, fields rename
        param.urlPath = param.signatureUrl;
        param.certFileName = param.privateCertFileName;

        // set nouce & timestamp
        param.nonce = param.nonce || nonceLib();
        param.timestamp = param.timestamp || (new Date).getTime();

        // set signatureMethod
        //param.signatureMethod = _.isNil(param.secret) ? 'SHA256withRSA' : 'HMACSHA256';

        param.signature = apex.getSignatureToken(param);

        if (param.debug) showBaseString(param);
    }

    if (param.nextHop != undefined && param.nextHop.signatureUrl != undefined) {
        // propagate queryString and formData to nextHop...
        param.nextHop.queryString = param.queryString;
        param.nextHop.formData = param.formData;

        // propagate old peroperty...
        param.nextHop.urlPath = param.nextHop.signatureUrl;
        param.nextHop.certFileName = param.nextHop.privateCertFileName;

        // set nouce & timestamp
        param.nextHop.nonce = param.nextHop.nonce || nonceLib();
        param.nextHop.timestamp = param.nextHop.timestamp || (new Date).getTime();

        // set signatureMethod
        //param.nextHop.signatureMethod = _.isNil(param.secret) ? 'SHA256withRSA' : 'HMACSHA256';

        let childToken = apex.getSignatureToken(param.nextHop);

        if (param.debug) showBaseString(param.nextHop);

        if (childToken != null) {
            if (param.signature != undefined && param.signature.length > 0 ) {
                param.signature += ', ' + childToken;
            } else {
                param.signature = childToken;
            }
        }
    }
}

var defaultParam = undefined;
util.setDefaultParam = (defaultValue) => {
    defaultParam = defaultValue;
}

function propagateDefaultValue(param) {
    if (defaultParam == undefined) return;

    for (let key in defaultParam) {
        if (param[key] == undefined) param[key] = defaultParam[key];
    }
}

util.executeTest = (param) => {
    return new promise(function(resolve, reject){
        // propagate default params
        propagateDefaultValue(param);

        if (param.skipTest != undefined && param.skipTest) {
            return resolve();
        }

        // Count Test
        totalTest += 1;

        // validate parameters here...
        if (param.formData != undefined && Array.isArray(param.formData)) {
            throw new Error("Property 'formData' cannot be an array.\nparam:::\n" + JSON.stringify(param, null, 4));
        }

        if (param.queryString != undefined && Array.isArray(param.queryString)) {
            throw new Error("Property 'queryString' cannot be an array.\nparam:::\n" + JSON.stringify(param, null, 4));
        }

        // get the authorization token
        util.getApexSecurityToken(param);

        return util.invokeRequest(param).then(function(res) {
            if (!_.isEmpty(res.body))
                param.responseBody = res.body;
            else
                param.responseText = res.text;
    
            if (param.verifyFunction != undefined) {
                if (param.verifyMessage == undefined) param.verifyMessage = "\n";

                // execute verification function from parameters
                return util[param.verifyFunction](param, res).then(testResult => { param.testPassed = testResult; });
            } else {
                // test pass
                param.testPassed = true;
            }
        }).catch(function(error) { 
            param.error = error;

            if (param.negativeTest != undefined && param.negativeTest){
                param.testPassed = true;
            }
        }).finally( () => { return resolve() });
    }).then( () => { 
        if (param.delay == undefined) {
            param.delay = 0;
        }
    }).delay(param.delay)
    .catch(function(error) {
        param.error = error;
    }).finally( () => {
        if (param.skipTest != undefined && param.skipTest) {
            skipTest++;
            return;
        }

        if (param.debug) {
            console.log(">>> " + param.id + ". " + param.description + " <<< - Start.");

            if (param.baseString != undefined) console.log('\nBaseString::: \n' + param.baseString);    
            if (param.nextHop != undefined && param.nextHop.baseString != undefined) console.log('\nNextHop BaseString::: \n' + param.nextHop.baseString);    

            if (param.signature != undefined) console.log('\nAuthorization Token::: \n' + param.signature);    
        
            console.log("\nURL:::");
            console.log(param.invokeUrl);

            if (param.responseBody != undefined || param.responseText != undefined) console.log("\nResponse:::");
            if (param.responseBody != undefined) console.log(JSON.stringify(param.responseBody, null, 4));
            if (param.responseText != undefined) console.log("TEXT:::" + param.responseText);

            if (param.delay > 0) console.log("Execution Delay(Milliseconds):::" + param.delay);

            if (param.verifyMessage != undefined) console.log(param.verifyMessage);
        }

        if (param.testPassed != undefined && param.testPassed) {
            passedTest++;

            if(!param.suppressMessage) {
                if(param.debug) console.log();
                if (param.negativeTest != undefined && param.negativeTest) {

                    if (param.testErrorMessage != undefined && param.testErrorMessage == ((param.error) ? param.error.message : '')) {
                        console.log(">>> " + param.id + ". " + param.description + " <<< - Negative Test Success.\n" + param.error.message + "\n");
                    } else {
                        passedTest--;
                        console.log(">>> " + param.id + ". " + param.description + " <<< - Negative Test Failed.\nExpecting Error:::" + param.testErrorMessage + "\n        But Get:::" + ((param.error) ? param.error.message : '') + "\n");
                    }
                } else {
                    console.log(">>> " + param.id + ". " + param.description + " <<< - Success.");
                }
                if (param.delay > 0) console.log(">>> Execution Delay(Milliseconds):::" + param.delay);
            }
        } else {
            if (param.debug) console.log();
            if (!param.debug) {
                console.log(">>> " + param.id + ". " + param.description + " <<< - Start.");
                console.log("\nURL:::");
                console.log(param.invokeUrl);
                console.log();
            }
            console.log(">>> " + param.id + ". " + param.description + " <<< - Failed. " + param.error.message);

            if (param.error != undefined && param.error.response != undefined) {
                console.log("   >>> statusCode::: " + param.error.response.statusCode);
                console.log("   >>> clientError::: " + param.error.response.clientError);
                console.log("   >>> serverError::: " + param.error.response.serverError);
                
                if(param.debug) console.log(param.error);

                console.log("=== errorText::: ===");
                console.log(param.error.response.error.text);
                console.log("=== errorText::: ===");
            }
        }
        if (param.showElapseTime) console.log("\n" + getElapseTime(param.startTime, param.timespan));
        if (param.debug) console.log(">>> " + param.id + ". " + param.description + " <<< - END.");
    });    
}

function getElapseTime(startDate, ts) {
    var message = "";
    if (startDate == undefined || ts == undefined) return message;

    message += " Start Time: " + startDate.format() + "\n";
    message += "   End Time: " + ts.endDate.format() + "\n";

    if ((ts.totalSeconds()|0) == 0) {
        message += "Elapse Time: " + ts.milliseconds + " milliseconds";
    } else if ((ts.totalMinutes()|0) == 0) {
        message += "Elapse Time: " + ts.seconds + " seconds " + ts.milliseconds + " milliseconds";
    } else if ((ts.totalHours()|0) == 0) {
        message += "Elapse Time: " + ts.minutes + " minutes " + ts.seconds + " seconds " + ts.milliseconds + " milliseconds";
    } else {
        message += "Elapse Time: " + (ts.totalHours()|0) + " hours " + ts.minutes + " minutes " + ts.seconds + " seconds " + ts.milliseconds + " milliseconds";
    }
    return message;
}

module.exports = {
    apiHelper : util
};
