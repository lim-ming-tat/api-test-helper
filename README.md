# api-test-helper
Helper Library to test API

1. Create a new node js project in a new folder.

2. Get the test helper package.
```
npm i https://github.com/lim-ming-tat/api-test-helper.git --save
```
2.1 The following dependency will be added to the package.json
```
  "dependencies": {
    "api-test-helper": "git+https://github.com/lim-ming-tat/api-test-helper.git"
  }
```
3. Sample Data, save the following json in data.json file
```
    {
        "id" : "1",
        "description" : "Simple Parameter Template.",

        "invokeUrl" : "http://www.example.com/",
        "httpMethod" : "GET",

        "debug" : false
    }
```
4. Code Sample, save the following code in index.js file
```
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
```
node index
```
6. Sample execution results and results
```
>>> 1. Simple Parameter Template. <<< - Success.
>>> 2. Gateway Security Parameter (L2) Template. <<< - Success.

Test Results::: 2/2
```