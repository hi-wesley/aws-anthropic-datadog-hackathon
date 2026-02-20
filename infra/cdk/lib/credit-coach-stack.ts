import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as apigw from "aws-cdk-lib/aws-apigateway";
import * as cloudwatch from "aws-cdk-lib/aws-cloudwatch";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as iam from "aws-cdk-lib/aws-iam";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as s3 from "aws-cdk-lib/aws-s3";

export class CreditCoachStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const sessionsTable = new dynamodb.Table(this, "CreditCoachSessions", {
      partitionKey: { name: "pk", type: dynamodb.AttributeType.STRING },
      sortKey: { name: "sk", type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      pointInTimeRecovery: true,
      removalPolicy: cdk.RemovalPolicy.DESTROY
    });

    const artifactsBucket = new s3.Bucket(this, "CreditCoachArtifacts", {
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true
    });

    const apiFunction = new lambda.Function(this, "CreditCoachApiFn", {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: "index.handler",
      timeout: cdk.Duration.seconds(30),
      memorySize: 1024,
      code: lambda.Code.fromInline(`
exports.handler = async () => ({
  statusCode: 200,
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    message: "Deploy apps/api as this Lambda package in the next step.",
    service: "credit-coach-api"
  })
});
`),
      environment: {
        AWS_REGION: cdk.Stack.of(this).region,
        SESSIONS_TABLE_NAME: sessionsTable.tableName,
        ARTIFACTS_BUCKET_NAME: artifactsBucket.bucketName,
        DD_SERVICE: "credit-coach-api",
        DD_ENV: "prod"
      }
    });

    sessionsTable.grantReadWriteData(apiFunction);
    artifactsBucket.grantReadWrite(apiFunction);

    apiFunction.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          "bedrock:InvokeModel",
          "bedrock:InvokeModelWithResponseStream",
          "bedrock:Converse",
          "bedrock:ConverseStream",
          "polly:SynthesizeSpeech",
          "transcribe:StartTranscriptionJob",
          "transcribe:GetTranscriptionJob"
        ],
        resources: ["*"]
      })
    );

    const restApi = new apigw.LambdaRestApi(this, "CreditCoachApi", {
      handler: apiFunction,
      proxy: true,
      deployOptions: {
        stageName: "prod",
        metricsEnabled: true,
        loggingLevel: apigw.MethodLoggingLevel.INFO,
        dataTraceEnabled: true
      }
    });

    const latencyAlarm = new cloudwatch.Alarm(this, "ApiLatencyAlarm", {
      metric: restApi.metricLatency({ statistic: "p95", period: cdk.Duration.minutes(5) }),
      threshold: 3000,
      evaluationPeriods: 2,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD
    });

    new cdk.CfnOutput(this, "ApiBaseUrl", {
      value: restApi.url,
      description: "Primary API endpoint"
    });

    new cdk.CfnOutput(this, "SessionsTableName", {
      value: sessionsTable.tableName
    });

    new cdk.CfnOutput(this, "ArtifactsBucketName", {
      value: artifactsBucket.bucketName
    });

    new cdk.CfnOutput(this, "LatencyAlarmName", {
      value: latencyAlarm.alarmName
    });
  }
}
