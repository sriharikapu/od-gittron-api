"use strict";
require("dotenv").config();

const AWS = require("aws-sdk");
const GitHubData = require("../util/github-data");
const { generateTokenID, generateDNA } = require("../util/meta-maker");

const dynamoDb = new AWS.DynamoDB.DocumentClient();

module.exports.initToken = async (event, context) => {
  const timestamp = new Date().getTime();
  const reqData = JSON.parse(event.body);

  // TODO: better validation maybe
  if (typeof reqData.repo !== "string" || !reqData.tokenType) {
    console.error("Validation Failed");
    return {
      statusCode: 400,
      headers: { "Content-Type": "text/plain" },
      body: "Couldn't create the repo item."
    };
  }

  const githubber = new GitHubData({
    repo: reqData.repo,
    owner: reqData.repoOwner
  });

  try {
    const { data } = await githubber.getRepo();
    githubber.repoData = data;

    //TODO: Change hard coded generation
    const generation = reqData.generation || 0;

    const tokenId = generateTokenID(
      githubber.repoData,
      reqData.tokenType,
      generation
    );

    const stats = await githubber.generateStats();

    const dna = generateDNA(stats, generation);

    //TODO: Add from name generator
    const tokenUriData = {
      name: tokenId,
      description: githubber.repoData.description,
      image: `https://s3.amazonaws.com/od-flat-svg/${tokenId}.png`,
      meta: stats
    };

    const params = {
      TableName: process.env.DYNAMODB_TABLE,
      Item: {
        ghid: githubber.repoData.id.toString(),
        tokenId: tokenId.toString(),
        repo: reqData.repo,
        repoOwner: reqData.repoOwner,
        tokenUriData: tokenUriData,
        createdAt: timestamp,
        updatedAt: timestamp,
        tokenType: reqData.tokenType,
        generation,
        dna
      }
    };

    const putItem = new Promise((res, rej) => {
      dynamoDb.put(params, function(err, data) {
        if (err) {
          console.log("Error", err);
          rej(err);
        } else {
          console.log("Success", data);
          res("Hi, insert data completed");
        }
      });
    });

    await putItem;

    return {
      statusCode: 200,
      // headers: {
      //   "Content-Type": "application/json",
      //   "Access-Control-Allow-Origin": "*"
      // },
      body: JSON.stringify(params.Item)
    };
  } catch (error) {
    console.log(error);
    return {
      statusCode: 400,
      headers: { "Content-Type": "text/plain" },
      body: error
    };
  }
};