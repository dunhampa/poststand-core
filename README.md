# POSTSTAND-CORE

A node API oriented framework that is used instead of postman

## Features Like Postman
* Make individual API calls and inspect response of individual calls (Similar to postman's Requests)
* Share memory space between calls (Similar to postman's Global variables)
* Run entire recipe/collection of calls to complete a script (Similar to postman's Collections )
* Set next call dynamically (Similar to postman's setNextRequest())
* Stores shared memory locally so it can be inspected for script development (Similar to postman's Variable inspector )

## Better Than Postman
* Option to use AWS Secrets Manager for local development 
* Deploy directly to AWS Lambdas with CDK without requiring changes
* By using standard javascript (.js) AI LLMs such as ChatGpt/Copilot are more effectively able to drafts scripts directly while incorporating API paging and error specs   
* Is all open source and runs locally (no cloud sync)
* Run entire recipes/collections (postman recently paywalled this)


## Linking for local development
```
<cd or start from poststand directory>
npm install
npm link
cd test_testingPostStandConsumer/
npm link poststand-core
npm install    

```