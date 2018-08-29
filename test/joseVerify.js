"use strict" 

const jose = require('node-jose');
const fs = require('fs');

// please refer to node-jose library for supported certificate type
var param = {
    "privateCertFileName" : "myCert.pem",
    "privateCertFileType" : "pem"
}

// response - http response object
function verifyJws(param, response) {
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
                    param.verifyMessage += "JWS Response:::\n" + JSON.stringify(JSON.parse(result.payload.toString()), null, 4) + "\n";

                    return true;
                });
        });
}

// response - http response object
function verifyJwe(param, response) {
    param.verifyJweJws = false;
    return verifyJose(param, response);
}

function verifyJweJws(param, response) {
    param.verifyJweJws = true;
    return verifyJose(param, response);
}

// response - http response object
function verifyJose(param, response) {
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
                    param.verifyMessage += "JWE Response:::\n" + JSON.stringify(JSON.parse(result.payload.toString()), null, 4) + "\n";

                    if (param.verifyJweJws) {
                        var customResponse = {};

                        if (result.payload.toString().substr(0, 1) == "{") {
                            customResponse.type = "application/jose+json"
                            customResponse.body = JSON.parse(result.payload.toString());
                        }
                        else {
                            customResponse.type = "application/jose"
                            customResponse.text = result.payload.toString();
                        }

                        return verifyJws(param, customResponse);
                    }

                    return true;
                });
        });
}

module.exports = {
    verifyJws : verifyJws,
    verifyJwe : verifyJwe,
    verifyJweJws : verifyJweJws
};
