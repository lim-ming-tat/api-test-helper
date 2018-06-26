"use strict" 

const jose = require('node-jose');
const fs = require('fs');

// please refer to node-jose library for supported certificate type
var param = {
    "publicCertFileName" : "myCert.pem",
    "publicCertFileType" : "pem"
}

// response - http response object
function customVerifyJws(param, response) {
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
                    if (param.debug) {
                        console.log("Data:::");
                        console.log(result.payload.toString());

                        console.log("\n");
                    }
                    if(!param.suppressMessage) {
                        console.log(">>> " + param.id + ". " + param.description + " <<< - JWS Verification Success.");
                    }

                    return true;
                })
                .catch(function(error) {
                    if (param.negativeTest){
                        if(!param.suppressMessage) console.log(">>> " + param.id + ". " + param.description + " <<< - Negative JWS Verification Success. " + error);

                        // test pass
                        return true;
                    } else {
                        console.log("JWS Verification Failed..." + error);

                        return false;
                    }
                });
        });
}

module.exports = {
    customVerifyJws : customVerifyJws
};
