#!/usr/bin/env node
import "source-map-support/register";
import * as cdk from "aws-cdk-lib";
import { CreditCoachStack } from "../lib/credit-coach-stack";

const app = new cdk.App();
new CreditCoachStack(app, "CreditCoachStack", {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION ?? "us-east-1"
  }
});
