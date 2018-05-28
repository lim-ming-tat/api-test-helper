"use strict" 

const nonceLib = require('nonce')();
const request = require('superagent');
const fs = require('fs');
const jose = require('node-jose');
const promise = require('bluebird');
const qs = require('querystring');
const { URL } = require('url');

const _ = require("lodash");

const apex = require('node-apex-api-security').ApiSigningUtil;

var _debug = false;

var totalTest = 0;
var passedTest = 0;

let util = {};

util.invokeRequest = (param) => {
    return new promise(function(resolve, reject){
        if (param.ignoreServerCert)
            process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

        const targetURL = new URL(param.invokeUrl);

        // construct query string
        if (param.queryString != undefined) {
            targetURL.search = qs.stringify(param.queryString, null, null, {encodeURIComponent: decodeURIComponent}) + targetURL.search.replace('?', '&');
        }

        let req = request(param.httpMethod, targetURL.href);

        req.buffer(true);

        if (param.caCertFileName != undefined){
            req.ca(fs.readFileSync(param.caCertFileName, "utf8"));
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

        if (param.httpMethod == "POST" || param.httpMethod == "PUT" && param.formData != undefined) {
            let postData = qs.stringify(param.formData, null, null, {encodeURIComponent: decodeURIComponent});
            req = req.type("application/x-www-form-urlencoded").set("Content-Length", Buffer.byteLength(postData)).send(postData);
        }
        
        req.then(function(res) {
            resolve(res);
        })
        .catch(function(err) {
            reject(err);
        });
    });
}

util.performTest = (params, verifyFunction) => {
    //console.log( "Entering recursive function for [", params.length, "]." );
    
    var testFunction = util.performTestGatewaySecurity;

    // Once we hit zero, bail out of the recursion. The key to recursion is that
    // it stops at some point, and the callstack can be "rolled" back up.
    if ( params.length === 0 ) {
        return( Promise.resolve() );
    }
    
    var item = params;
    var newParams = [];

    if (Array.isArray(params)){
        // clone the parameyer array, may not work if consists of object reference
        var cloneParams = JSON.parse(JSON.stringify(params));

        item = cloneParams.splice(0,1)[0];
        newParams = cloneParams.splice(0);
    }

    var tangentialPromiseBranch = testFunction(item, verifyFunction).then(
        function() {
            return( util.performTest( newParams, verifyFunction ) ); // RECURSE!
        }
    )
    ;

    return( tangentialPromiseBranch );
}

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
                    // test pass
                    passedTest++;

                    if (debug) console.log("\n");
                    if (debug) console.log("Data:::");
                    if (debug) console.log(result.payload.toString());

                    if (debug) console.log("\n");
                    if (debug) console.log("JWS Verification Success...");

                    if (debug) console.log("\n");
                    console.log(">>> " + param.id + ". " + param.description + " <<< - Success.");
                })
                .catch(function(error) { 
                    //if (debug) console.log("\n>>> " + param.id + " <<<\n");
                    if (debug) console.log("\n");
                    if (debug) console.log("JWS Verification Failed..." + error);
                    if (debug) console.log("\n");

                    if (param.negativeTest){
                        passedTest++;

                        console.log(">>> " + param.id + ". " + param.description + " <<< - Negative Test Success. " + error);
                    } else {
                        console.log(">>> " + param.id + ". " + param.description + " <<< - Failed. " + error);
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
                    passedTest++;

                    if (debug) console.log("\n");
                    if (debug) console.log("Decrypted Data:");
                    if (debug) console.log(result.payload.toString());
                    
                    if (debug) console.log("\n");
                    if (debug) console.log("JWE Verification Success...");

                    if (debug) console.log("\n");
                    console.log(">>> " + param.id + ". " + param.description + " <<< - Success.");
                })
                .catch(function(error) { 
                    //if (debug) console.log("\n>>> " + param.id + " <<<\n");
                    if (debug) console.log("\n");
                    if (debug) console.log("JWE Verification Failed..." + error);
                    
                    if (debug) console.log("\n");
                    if (param.negativeTest){
                        passedTest++;

                        console.log(">>> " + param.id + ". " + param.description + " <<< - Negative Test Success. " + error);
                    } else {
                        console.log(">>> " + param.id + ". " + param.description + " <<< - Failed. " + error);
                    }
                });
        });
}

util.displayTestResult = () => {
    return Promise.resolve("Test Results::: " + passedTest + "/" + totalTest + "\n");
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
    let baseString = apex.getSignatureBaseString(baseProps);
    console.log('\nBaseString::: \n\"' + baseString + "\"\n");
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

        //console.log('\n\n1. Signature::: ' + param.signature);
        if (param.debug) showBaseString(param);
    }

    if (param.nextHop != undefined && param.nextHop.signatureUrl != undefined) {
        //console.log('\n\n2. Signature::: ' + param.queryString);
        param.nextHop.queryString = param.queryString;

        // propergate old peroperty...
        param.nextHop.urlPath = param.nextHop.signatureUrl;
        param.nextHop.certFileName = param.nextHop.privateCertFileName;

        // set nouce & timestamp
        param.nextHop.nonce = param.nextHop.nonce || nonceLib();
        param.nextHop.timestamp = param.nextHop.timestamp || (new Date).getTime();

        // set signatureMethod
        param.nextHop.signatureMethod = _.isNil(param.secret) ? 'SHA256withRSA' : 'HMACSHA256';

        //console.log('\n\n3. Signature::: ' + JSON.stringify(param.nextHop));
        let childToken = apex.getSignatureToken(param.nextHop);

        //console.log('\n\n4. NextHop Signature::: ' + childToken);
        if (param.debug) showBaseString(param.nextHop);

        if (childToken != null) {
            if (param.signature != undefined && param.signature.length > 0 ) {
                param.signature += ', ' + childToken;
            } else {
                param.signature = childToken;
            }
        }
    }

    if (param.debug && param.signature != undefined) console.log('\nSignature::: \n' + param.signature);    
}

util.performTestGatewaySecurity = (param, verifyFunction) => {
    // test count
    totalTest += 1;

    var debug = _debug;
    if (param.debug != undefined && param.debug) debug = true;

    if (debug) console.log("\n>>> " + param.id + ". " + param.description + " <<< - Start.");

    try {
        util.getApexSecurityToken(param);
    } catch (error) {
        console.log("\n>>> " + param.id + ". " + param.description + " <<< - Start.");
        return Promise.reject(error);
    }
    
    return util.invokeRequest(param).then(function(res){
        var data = {};

        if (!_.isEmpty(res.body))
            data = res.body;
        else
            data = res.text;

        if (debug) console.log("\nResponse:::");
        if (debug && !_.isEmpty(res.body)) console.log(JSON.stringify(data));
        if (debug && _.isEmpty(res.body)) console.log("TEXT:::" + res.text);

        if (debug) console.log("\nURL:::");
        if (debug) console.log(param.invokeUrl);

        if (verifyFunction != undefined || param.verifyFunction != undefined) {
            if (verifyFunction != undefined || param.verifyFunction != undefined) {
                // execute verification function from parameters
                util[param.verifyFunction](param, res);
            } else {
                // execute verification function from call
                return verifyFunction(param, res);
            }
        } else {
            // test pass
            passedTest++;

            if (debug) console.log("\n");
            console.log(">>> " + param.id + ". " + param.description + " <<< - Success.");
        }
    }).catch(function(error) { 
        if (debug) console.log("\n");
        if (debug) console.log("HTTP Call Failed..." + error);
        if (debug) console.log("\n");

        if (param.negativeTest != undefined && param.negativeTest){
            passedTest++;

            console.log(">>> " + param.id + ". " + param.description + " <<< - Negative Test Success. " + error);
        } else {
            console.log(">>> " + param.id + ". " + param.description + " <<< - Failed. " + error);
        }
    });    
}

module.exports = {
    apiHelper : util
};
