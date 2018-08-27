"use strict" 

const crypto = require('crypto');
const request = require('superagent');
const fs = require('fs');
const jose = require('node-jose');
const promise = require('bluebird');
const qs = require('querystring');
const { URL } = require('url');

const _ = require("lodash");

const apex = require('node-apex-api-security').ApiSigningUtil;
const dateFormat = require('./timestamp').dateFormat;

var _debug = false;

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
            targetURL.search = qs.stringify(param.queryString, null, null, {encodeURIComponent: decodeURIComponent}) + targetURL.search.replace('?', '&');
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

        if (param.httpHeaders != undefined) {
            // Iterate through properties of headers
            for (let key in param.httpHeaders) {
                req = req.set(key, param.httpHeaders[key]);
            }
        }

        if ((param.httpMethod == "POST" || param.httpMethod == "PUT") && param.formData != undefined) {
            let postData = qs.stringify(param.formData, null, null, {encodeURIComponent: decodeURIComponent});
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

util.performTest = (params, verifyFunction) => {
    //console.log( "Entering recursive function for [", params.length, "]." );
    
    //var testFunction = util.performTestGatewaySecurity;
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

            newItem.queryString.llid = require('uuid/v1')().substring(0,8);
            newItem.description += " llid=" + newItem.queryString.llid;

            functionArray.push(util.performTest(newItem, verifyFunction));
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

            item.queryString.uuid = require('uuid/v1')().substring(0,8);
            item.description += " uuid=" + item.queryString.uuid;

            var repeatedParam = "";
            if (repeats == 0) {
                // repeats 2 times, so just add 1 item
                repeatedParam = JSON.parse('[' + stringCopy + ']');
            } else {
                repeatedParam = JSON.parse('[' + (stringCopy + ',').repeat(repeats) + stringCopy + ']');
            }

            // assign uuid to the rest
            _.forEach(repeatedParam, function(param) { param.queryString.uuid = require('uuid/v1')().substring(0,8); param.description += " uuid=" + param.queryString.uuid; });

            newParams = _.concat(repeatedParam, newParams);
        }

        //tangentialPromiseBranch = testFunction(item, verifyFunction);
        tangentialPromiseBranch = testFunction(item);
    }

    return(tangentialPromiseBranch.then(
        function() {
            return( util.performTest( newParams, verifyFunction ) ); // RECURSE!
        }
    ));
}
/*
util.verifyJws = (param, response) => {
    var debug = _debug;
    if (param.debug != undefined && param.debug) debug = true;

    var data = {};

    // convert compact to JSON
    if (response.type == "application/jose") 
    {
        var dataJoseCompact = response.text.split('.');

        // JWS - dataJoseCompact.length == 3
        data = {
            "type": "compact",
            "protected": dataJoseCompact[0],
            "payload": dataJoseCompact[1],
            "signature": dataJoseCompact[2],
            "header": JSON.parse(jose.util.base64url.decode(dataJoseCompact[0]).toString())
        };
    } else {
        data = response.body;
    }

    //var publicKey = fs.readFileSync(param.certFileName, "utf8");
    if (param.publicCertFileName == undefined) throw Error("Property 'publicCertFileName' not provided.");
    if (param.publicCertFileType == undefined) throw Error("Property 'publicCertFileType' not provided.");
    
    var publicKey = fs.readFileSync(param.publicCertFileName);

    // create keystore for jose
    var keystore = jose.JWK.createKeyStore();

    // convert private key into JWK
    return keystore.add(publicKey, param.publicCertFileType)
        .then(function(jwsKey) {
            // {result} is a jose.JWK.Key

            return jose.JWS.createVerify(jwsKey)
                .verify(data)
                .then(function(result) {
                    if (debug) console.log("\n");
                    if (debug) console.log("Data:::");
                    if (debug) console.log(result.payload.toString());

                    if (debug) console.log("\n");
                    if (debug) console.log("JWS Verification Success...");

                    if (debug) console.log("\n");
                    if(!param.suppressMessage) console.log(">>> " + param.id + ". " + param.description + " <<< - Success.");

                    // test pass
                    return true;
                })
                .catch(function(error) { 
                    //if (debug) console.log("\n>>> " + param.id + " <<<\n");
                    if (debug) console.log("\n");
                    if (debug) console.log("JWS Verification Failed..." + error);
                    if (debug) console.log("\n");

                    if (param.negativeTest){
                        //passedTest++;

                        if(!param.suppressMessage) console.log(">>> " + param.id + ". " + param.description + " <<< - Negative Test Success. " + error);

                        // test pass
                        return true;
                    } else {
                        console.log(">>> " + param.id + ". " + param.description + " <<< - Failed. " + error);

                        // test failed
                        return false;
                    }
                });
        });
}

util.verifyJwe = (param, response) => {
    var debug = _debug;
    if (param.debug != undefined && param.debug) debug = true;

    var data = {};

    // convert compact to JSON
    if (response.type == "application/jose") 
    {
        var dataJoseCompact = response.text.split('.');

        // JWE - dataJoseCompact.length == 5
        data = {
            "type": "compact",
            "ciphertext": dataJoseCompact[3],
            "protected": dataJoseCompact[0],
            "encrypted_key": dataJoseCompact[1],
            "tag": dataJoseCompact[4],
            "iv": dataJoseCompact[2],
            "header": JSON.parse(jose.util.base64url.decode(dataJoseCompact[0]).toString())
        };
    } else {
        data = response.body;
    }

    var privateKey = fs.readFileSync(param.privateCertFileName, "utf8");

    // create keystore for jose
    var keystore = jose.JWK.createKeyStore();

    // convert private key into JWK
    return keystore.add(privateKey, param.privateCertFileType)
        .then(function(jweKey) {
            // {result} is a jose.JWK.Key

            return jose.JWE.createDecrypt(jweKey)
                .decrypt(data)
                .then(function(result) {
                    // test pass
                    //passedTest++;

                    if (debug) console.log("\n");
                    if (debug) console.log("Decrypted Data:");
                    if (debug) console.log(result.payload.toString());
                    
                    if (debug) console.log("\n");
                    if (debug) console.log("JWE Verification Success...");

                    if (debug) console.log("\n");
                    if(!param.suppressMessage) console.log(">>> " + param.id + ". " + param.description + " <<< - Success.");

                    // test pass
                    return true;
                })
                .catch(function(error) { 
                    //if (debug) console.log("\n>>> " + param.id + " <<<\n");
                    if (debug) console.log("\n");
                    if (debug) console.log("JWE Verification Failed..." + error);
                    
                    if (debug) console.log("\n");
                    if (param.negativeTest){
                        //passedTest++;

                        if(!param.suppressMessage) console.log(">>> " + param.id + ". " + param.description + " <<< - Negative Test Success. " + error);

                        // test pass
                        return true;
                    } else {
                        console.log(">>> " + param.id + ". " + param.description + " <<< - Failed. " + error);

                        // test failed
                        return false;
                    }
                });
        });
}
*/
/*
util.displayExecutionTime = (param, response) => { return Promise.resolve().then( function() {
    //console.log(":::" + param.startTime.format());
    //console.log(":::" + param.timespan.endDate.format());
    //console.log(":::" + param.timespan.toString());

    console.log(">>> " + param.id + ". " + param.description + "::" + param.timespan.toString() + " <<< - Success.");

    return true;
} ) };
*/
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
        signatureMethod: param.signatureMethod || "signatureMethod",
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
        param.signatureMethod = _.isNil(param.secret) ? 'SHA256withRSA' : 'HMACSHA256';

        param.signature = apex.getSignatureToken(param);

        if (param.debug) showBaseString(param);
    }

    if (param.nextHop != undefined && param.nextHop.signatureUrl != undefined) {
        param.nextHop.queryString = param.queryString;

        // propergate old peroperty...
        param.nextHop.urlPath = param.nextHop.signatureUrl;
        param.nextHop.certFileName = param.nextHop.privateCertFileName;

        // set nouce & timestamp
        param.nextHop.nonce = param.nextHop.nonce || nonceLib();
        param.nextHop.timestamp = param.nextHop.timestamp || (new Date).getTime();

        // set signatureMethod
        param.nextHop.signatureMethod = _.isNil(param.secret) ? 'SHA256withRSA' : 'HMACSHA256';

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

// TODO: to support more default properties...
function propagateDefaultValue(param) {
    if (defaultParam == undefined) return;

    if (param.suppressMessage == undefined && defaultParam.suppressMessage != undefined) param.suppressMessage = defaultParam.suppressMessage;
    if (param.debug == undefined && defaultParam.debug != undefined) param.debug = defaultParam.debug;

    if (param.showElapseTime == undefined && defaultParam.showElapseTime != undefined) param.showElapseTime = defaultParam.showElapseTime;
    if (param.skipTest == undefined && defaultParam.skipTest != undefined) param.skipTest = defaultParam.skipTest;
    
    return;
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
    }).catch(function(error) {
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
            }
        } else {
            if(param.debug) console.log();
            console.log(">>> " + param.id + ". " + param.description + " <<< - Failed. " + param.error.message);
            if(param.debug) console.log(param.error);

            if (param.error != undefined && param.error.response != undefined) {
                console.log("   >>> statusCode::: " + param.error.response.statusCode);
                console.log("   >>> clientError::: " + param.error.response.clientError);
                console.log("   >>> serverError::: " + param.error.response.serverError);
        
                console.log("=== errorText::: ===");
                console.log(param.error.response.error.text);
                console.log("=== errorText::: ===");
            }
        }
        if (param.showElapseTime) console.log("\n" + getElapseTime(param.startTime, param.timespan));
    });    
}
/*
util.performTestGatewaySecurity = (param, verifyFunction) => {
    // propagate default params
    propagateDefaultValue(param);

    if (param.skipTest != undefined && param.skipTest) {
        return Promise.resolve();
    }

    // test count
    totalTest += 1;

    var debug = _debug;
    if (param.debug != undefined && param.debug) debug = true;

    //if (debug) console.log("\n>>> " + param.id + ". " + param.description + " <<< - Start.");

    // validate parameters here...
    if (param.formData != undefined && Array.isArray(param.formData)) {
        //throw Error("Property 'formData' cannot be an array. \nparam::" + JSON.stringify(param));
        return Promise.reject("\n>>> " + param.id + ". " + param.description + "<<< Property 'formData' cannot be an array.\nparam:::\n" + JSON.stringify(param, null, 4));
    }
    if (param.queryString != undefined && Array.isArray(param.queryString)) {
        //throw Error("Property 'queryString' cannot be an array. param::" + JSON.stringify(param));
        return Promise.reject("\n>>> " + param.id + ". " + param.description + "<<< Property 'queryString' cannot be an array.\nparam:::\n" + JSON.stringify(param, null, 4));
    }

    try {
        util.getApexSecurityToken(param);
    } catch (error) {
        console.log("\n>>> " + param.id + ". " + param.description + " <<< - Start.");
        return Promise.reject(error);
    }
    
    return util.invokeRequest(param).then(function(res){
        //var data = {};

        if (!_.isEmpty(res.body))
            param.responseBody = res.body;
        else
            param.responseText = res.text;

        //if (debug) console.log("\nResponse:::");
        //if (debug && !_.isEmpty(res.body)) console.log(JSON.stringify(data));
        //if (debug && _.isEmpty(res.body)) console.log("TEXT:::" + res.text);

        //if (debug) console.log("\nURL:::");
        //if (debug) console.log(param.invokeUrl);

        if (verifyFunction != undefined || param.verifyFunction != undefined) {
            if (param.verifyFunction != undefined) {
                // execute verification function from parameters
                //util[param.verifyFunction](param, res).then(verifyResult => { if (verifyResult) passedTest++; });
                util[param.verifyFunction](param, res).then(testResult => { param.testPassed = testResult; });
            } else {
                // execute verification function from call
                //verifyFunction(param, res).then(verifyResult => { if (verifyResult) passedTest++; });
                verifyFunction(param, res).then(testResult => { param.testPassed = testResult; });
            }
        } else {
            // test pass
            // passedTest++;
            param.testPassed = true;

            //if (debug) console.log("\n");
            //if(!param.suppressMessage) {
                //console.log(">>> " + param.id + ". " + param.description + " <<< - Success.");
                //if (param.showElapseTime) console.log(getElapseTime(param.startTime, param.timespan));
            //}
        }
    }).catch(function(error) { 
        //if (debug) {
            //console.log("\n");
            //console.log("HTTP Call Failed..." + error);
            //console.log("\n");
        //}

        param.error = error;
        if (param.negativeTest != undefined && param.negativeTest){
            param.testPassed = true;

            //if(!param.suppressMessage) {
                //console.log(">>> " + param.id + ". " + param.description + " <<< - Negative Test Success.\n" + error + "\n");
                //if (param.showElapseTime) console.log(getElapseTime(param.startTime, param.timespan));
            //}
        } else {
            //console.log();
            //console.log(">>> " + param.id + ". " + param.description + " <<< - Failed. " + error);

            //if (error.response != undefined) {
                //console.log(">>> statusCode::: " + error.response.statusCode);
                //console.log(">>> clientError::: " + error.response.clientError);
                //console.log(">>> serverError::: " + error.response.serverError);
        
                //console.log("=== errorText::: ===");
                //console.log(error.response.error.text);
                //console.log("=== errorText::: ===");
            //}

            //console.log("\nURL:::");
            ///console.log(param.invokeUrl);
            
            //if (param.showElapseTime) console.log("\n" + getElapseTime(param.startTime, param.timespan));
            //console.log(">>> " + "URL: " + param.invokeUrl);
            //console.log(">>> " + "Param: " + JSON.stringify(param));
            //console.log();
        }
    }).finally( () => {
        console.log();
        console.log(">>> finally... <<<");
        console.log("~~~~~~~~~~~");
        if (param.debug) {
            console.log(">>> " + param.id + ". " + param.description + " <<< - Start.");

            if (param.baseString != undefined) console.log('\nBaseString::: \n' + param.baseString);    
            if (param.nextHop != undefined && param.nextHop.baseString != undefined) console.log('\nNextHop BaseString::: \n' + param.nextHop.baseString);    

            if (param.signature != undefined) console.log('\nAuthorization Token::: \n' + param.signature);    
        
            console.log("\nURL:::");
            console.log(param.invokeUrl);

            if (param.responseBody != undefined || param.responseText != undefined) console.log("\nResponse:::");
            if (param.responseBody != undefined) console.log(JSON.stringify(param.responseBody));
            if (param.responseText != undefined) console.log("TEXT:::" + param.responseText);
        }

        if (param.testPassed != undefined && param.testPassed) {
            passedTest++;

            if(!param.suppressMessage) {
                if(param.debug) console.log();
                if (param.negativeTest != undefined && param.negativeTest)
                    console.log(">>> " + param.id + ". " + param.description + " <<< - Negative Test Success.\n" + param.error + "\n");
                else
                    console.log(">>> " + param.id + ". " + param.description + " <<< - Success.");
            }
        } else {
            console.log();
            console.log(">>> " + param.id + ". " + param.description + " <<< - Failed. " + param.error);

            if (param.error.response != undefined) {
                console.log("   >>> statusCode::: " + param.error.response.statusCode);
                console.log("   >>> clientError::: " + param.error.response.clientError);
                console.log("   >>> serverError::: " + param.error.response.serverError);
        
                console.log("=== errorText::: ===");
                console.log(param.error.response.error.text);
                console.log("=== errorText::: ===");
            }
        }
        if (param.showElapseTime) console.log("\n" + getElapseTime(param.startTime, param.timespan));

        console.log("^^^^^^^^^^^");
        console.log("=== finally... ===");
    });    
}
*/
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
