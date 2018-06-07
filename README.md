# api-test-helper
Helper Library to test API

1. Create a new node js project in a new folder.

2. Get the test helper package.
```text
npm i https://github.com/lim-ming-tat/api-test-helper.git --save
```
2.1 The following dependency will be added to the package.json
```text
  "dependencies": {
    "api-test-helper": "git+https://github.com/lim-ming-tat/api-test-helper.git"
  }
```
3. Sample Data, save the following json in data.json file
```text
    {
        "id" : "1",
        "description" : "Simple Parameter Template.",

        "invokeUrl" : "http://www.example.com/",
        "httpMethod" : "GET",

        "debug" : false
    }
```
4. Code Sample, save the following code in index.js file
```text
"use strict" 

const helper = require('api-test-helper').apiHelper;

let params = require('./data.json');

Promise.resolve()
    .then(function() { return helper.performTest(params) })

    .then(helper.displayTestResult).then(message => console.log("\n" + message))
    .catch(function(error) { 
        console.log(error);
    })
    ;
```
5. Execute the test.
```text
node index
```
6. Sample execution results and results
```text
>>> 1. Simple Parameter Template. <<< - Success.
>>> 2. Gateway Security Parameter (L2) Template. <<< - Success.

Test Results::: 2/2
```

7. L0 Parameters Example
```text
{
    "id" : "L0",
    "description" : "Gateway Security Parameter (L0) Template.",

    "invokeUrl" : "https://sample.api.gov.sg:443/api/v1/myApi",
    "httpMethod" : "GET",
    "queryString" : { "clientname" : "node.js.test.l0", "data" : "some data value" },
    "formData" :  null ,

    "debug" : false
}
```
8. L1 Parameters Example
```text
{
    "id" : "L1",
    "description" : "Gateway Security Parameter (L1) Template.",

    "authPrefix": "apex_l1_eg",
    "realm" : "http://example.api.gov.sg",
    "appId" : "app-id",
    "secret" : "app-secret",
    "invokeUrl" : "https://example.api.gov.sg:443/division/project/v1/apiName",
    "signatureUrl" : "https://example.e.api.gov.sg:443/division/project/v1/apiName",
    "httpHeaders" : null,
    "httpMethod" : "GET",
    "queryString" : { "clientname" : "node.js.test.l1", "data" : "some data value" },
    "formData" :  null ,

    "negativeTest" : false,
    "debug" : false,

    "ignoreServerCert" : false,
    "caCertFileName" : "COMODO_RSA_Certification_Authority.public.pem",
    "caCertFileType" : "pem"
}
```
9. L2 Parameters Example
```text
{
    "id" : "L2",
    "description" : "Gateway Security Parameter (L2) Template.",

    "authPrefix": "apex_l2_eg",
    "realm" : "http://example.api.gov.sg",
    "appId" : "app-id",
    "secret" : null,
    "invokeUrl" : "https://example.api.gov.sg:443/division/project/v1/apiName",
    "signatureUrl" : "https://example.e.api.gov.sg:443/division/project/v1/apiName",
    "httpHeaders" : null,
    "httpMethod" : "GET",
    "queryString" : { "clientname" : "node.js.test.l2", "data" : "some data value" },
    "formData" :  null ,

    "privateCertFileName" : "myCert.nopass.pem",
    "privateCertFileType" : "pem",

    "negativeTest" : false,
    "debug" : false,

    "ignoreServerCert" : true
}
```
