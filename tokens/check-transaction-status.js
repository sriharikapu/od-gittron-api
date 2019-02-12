"use strict";

const AWS = require("aws-sdk");
const EtherScanApi = require("../util/etherscan-api");

const dynamoDb = new AWS.DynamoDB.DocumentClient();

const lambda = new AWS.Lambda({
  region: "us-east-1"
});

module.exports.checkTransactionStatus = async (event, context) => {
  const timestamp = new Date().getTime();
  const data = JSON.parse(event.body);

  // TODO: better validation
  if (!data.txHash || !data.tokenId || !data.ghid) {
    console.error("Validation Failed");
    return {
      statusCode: 400,
      headers: {
        "Content-Type": "text/plain",
        "Access-Control-Allow-Origin": "*"
      },
      body: "Couldn't update the repo."
    };
  }

  try {
    const api = new EtherScanApi();
    const txStatus = await api.getTransactionReceipt(data.txHash);

    const status = txStatus.result ? txStatus.result.status : "pending";

    if (status === "0x1") {
      const updateParams = {
        TableName: process.env.DYNAMODB_TABLE,
        Key: {
          tokenId: data.tokenId,
          ghid: data.ghid
        },
        ExpressionAttributeValues: {
          ":mined": true,
          ":txHash": data.txHash,
          ":updatedAt": timestamp
        },
        UpdateExpression:
          "SET mined = :mined, txHash = :txHash, updatedAt = :updatedAt",
        ReturnValues: "ALL_NEW"
      };

      const updateItem = new Promise((res, rej) => {
        dynamoDb.update(updateParams, function(err, data) {
          if (err) {
            console.log("Error", err);
            rej(err);
          } else {
            console.log("Success", data);
            res("Hi, data update completed");
          }
        });
      });

      await updateItem;

      return {
        statusCode: 200,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*"
        },
        body: JSON.stringify({ message: "Transaction Mined" })
      };
    } else if (status === "0x0") {
      const deleteParams = {
        TableName: process.env.DYNAMODB_TABLE,
        Key: {
          ghid: data.ghid,
          tokenId: data.tokenid
        }
      };

      const deleteItem = new Promise((res, rej) => {
        dynamoDb.delete(deleteParams, function(err, data) {
          if (err) {
            console.log("Error", err);
            rej(err);
          } else {
            console.log("Success", data);
            res(data);
          }
        });
      });

      await deleteItem;

      return {
        statusCode: 200,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*"
        },
        body: JSON.stringify({ status: "Deleted" })
      };
    } else {
      return {
        statusCode: 200,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*"
        },
        body: JSON.stringify({ status: "Pending" })
      };
    }
  } catch (error) {
    console.log(error);
    return {
      statusCode: 400,
      headers: {
        "Content-Type": "text/plain",
        "Access-Control-Allow-Origin": "*"
      },
      body: error
    };
  }
};