"use strict";

const AWS = require("aws-sdk");
const { generateSvgPayload, addMutationSvgs } = require("../util/meta-maker");

const lambda = new AWS.Lambda({
  region: "us-east-1"
});

const dynamoDb = new AWS.DynamoDB.DocumentClient();

module.exports.generatePng = async (event, context) => {
  const reqData = JSON.parse(event.body);

  const params = {
    TableName: process.env.DYNAMODB_TABLE,
    Key: {
      tokenId: reqData.tokenId,
      ghid: reqData.ghid
    }
  };

  const getItem = new Promise((res, rej) => {
    dynamoDb.get(params, function(err, data) {
      if (err) {
        console.log("Error", err);
        rej(err);
      } else {
        console.log("Success", data);
        res(data);
      }
    });
  });

  try {
    const { Item } = await getItem;

    const { svgs, colors } = generateSvgPayload(Item.dna);

    const htmlGenPayload = {
      outputName: Item.tokenId,
      templateVars: [
        { name: "primaryColor", value: colors[0] },
        { name: "secondaryColor", value: colors[1] },
        { name: "name", value: Item.repo }
      ]
    };
    const html = await lambda
      .invoke({
        FunctionName: "od-sls-htmlgen-dev-htmlgen",
        Payload: JSON.stringify(htmlGenPayload, null, 2)
      })
      .promise();

    const htmlRes = JSON.parse(html.Payload);

    const svgWithMutations = addMutationSvgs(Item.mutationDna, svgs);

    const svgGenPayload = {
      svgs: svgWithMutations,
      html: htmlRes.url,
      name: Item.tokenId,
      timeout: 1000
    };

    const svgData = await lambda
      .invoke({
        FunctionName: "od-sls-svgflatr-dev-phantomsvgflatr",
        Payload: JSON.stringify(svgGenPayload, null, 2)
      })
      .promise();

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": process.env.ORIGIN
      },
      body: svgData.Payload
    };
  } catch (error) {
    console.log(error);
    return {
      statusCode: error.statusCode || 501,
      headers: {
        "Content-Type": "text/plain",
        "Access-Control-Allow-Origin": process.env.ORIGIN
      },
      body: "no robot."
    };
  }
};
