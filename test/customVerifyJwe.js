"use strict" 

const jose = require('node-jose');
const fs = require('fs');

// please refer to node-jose library for supported certificate type
var param = {
    "privateCertFileName" : "myCert.pem",
    "privateCertFileType" : "pem"
}

// response - http response object
function customVerifyJwe(param, response) {
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

    if (param.privateCertFileName == undefined) throw Error("Property 'privateCertFileName' not provided.");
    if (param.privateCertFileType == undefined) throw Error("Property 'privateCertFileType' not provided.");

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
                    if (param.debug) {
                        console.log("Decrypted Data:");
                        console.log(result.payload.toString());
                        
                        console.log("\n");
                    }
                    if(!param.suppressMessage) {
                        console.log(">>> " + param.id + ". " + param.description + " <<< - JWE Verification Success.");
                    }

                    return true;
                })
                .catch(function(error) { 
                    if (param.negativeTest){
                        if(!param.suppressMessage) console.log(">>> " + param.id + ". " + param.description + " <<< - Negative JWE Verification Success. " + error);

                        // test pass
                        return true;
                    } else {
                        console.log("JWE Verification Failed..." + error);

                        return false;
                    }
                });
        });
}

module.exports = {
    customVerifyJwe : customVerifyJwe
};
