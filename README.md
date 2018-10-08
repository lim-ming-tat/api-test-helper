# api-test-helper
Helper Library to test API

1. Create a new node js project in a new folder.
```text
mkdir newProject
cd newProject
npm init
```

2. Get the test helper package.
```text
npm i https://github.com/lim-ming-tat/api-test-helper.git --save
```
    The following dependency will be added to the package.json
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
        "httpMethod" : "GET"
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
node index.js
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

    "invokeUrl" : "https://sample.api.gov.sg:443/division/v1/myResources",
    "httpMethod" : "GET",

    "queryString" : { "clientname" : "node.js.test.l0", "data" : "some data value" },

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

    "invokeUrl" : "https://example.api.gov.sg:443/division/project/v1/myResources",
    "signatureUrl" : "https://example.e.api.gov.sg:443/division/project/v1/myResources",

    "httpMethod" : "GET",
    "queryString" : { "clientname" : "node.js.test.l1", "data" : "some data value" },

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

    "invokeUrl" : "https://example.api.gov.sg:443/division/project/v1/myResources",
    "signatureUrl" : "https://example.e.api.gov.sg:443/division/project/v1/myResources",

    "httpMethod" : "GET",
    "queryString" : { "clientname" : "node.js.test.l2", "data" : "some data value" },

    "privateCertFileName" : "myCert.nopass.pem",
    "privateCertFileType" : "pem"
}
```
10. L21 Parameters Example
```text
{
    "id" : "L2",
    "description" : "Gateway Security Parameter (L2) Template.",

    "authPrefix": "apex_l2_eg",
    "realm" : "http://example.api.gov.sg",
    "appId" : "app-id",

    "invokeUrl" : "https://example.api.gov.sg:443/division/project/v1/myResources",
    "signatureUrl" : "https://example.e.api.gov.sg:443/division/project/v1/myResources",

    "httpMethod" : "GET",
    "queryString" : { "clientname" : "node.js.test.l2", "data" : "some data value" },


    "privateCertFileName" : "myCert.nopass.pem",
    "privateCertFileType" : "pem",

    "nextHop": {
        "authPrefix": "apex_l1_ig",
        "realm" : "http://example.api.gov.sg",
        "appId" : "app-id",
        "secret" : "app-secret",

        "signatureUrl" : "https://example.i.api.gov.sg:443/division/project/v1/myResources",
        "httpMethod" : "GET"
    }
}
```
11. Execute Test with Timer
```
Promise.resolve()
    // start the timer
    .then(function() { return helper.startTestTimer() })

    .then(function() { return helper.performTest(params) })

    .then(helper.displayTestResult).then(message => console.log("\n" + message))
    .then(helper.displayElapseTime).then(message => console.log("\n" + message + "\n"))
    .catch(function(error) { 
        console.log(error);
    })
;
```
Test Result Sample
```text
...

Test Results::: 1/2

 Start Time: 2018-08-23 16:28:59.834
   End Time: 2018-08-23 16:29:00.667
Elapse Time: 833 milliseconds
```
12. Submit Multi-Part POST
```
{
    "id" : "1",
    "description" : "Hedwig Test.",

    "authPrefix": "apex_l1_eg",
    "realm" : "http://node.js.test.l2.eg",
    "appId" : "appName",
    "secret" : "AppSecret",

    "invokeUrl" : "https://playlab.api.lab/hedwig-intranet",
    "signatureUrl" : "https://playlab.api.lab/hedwig-intranet",

    "httpMethod" : "POST",

    "multiPartData": { 
        "fileds": { 
            "mail[from]": "from@my.company.sg",
            "mail[to]": "to@your.company.sg",
            "mail[subject]": "multiPartData Test",
            "mail[html]": "test text",
            "mail[text]": "test html"
        },
        "attachments": {
            "files": [ "./401-history.png", "./402-h2.png" ],
            "files1": "./401-history.png",
            "files2": "./402-h2.png"
        }
    }
}
```
13. For more parameters options, please refer to ./test/sample.json and ./test/sample.security.json for details.
14. For more configuration options, please refer to ./test/unitTest.js for details.
