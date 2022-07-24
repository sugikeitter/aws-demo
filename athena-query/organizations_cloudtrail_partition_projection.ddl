CREATE EXTERNAL TABLE default.organizations_cloudtrail_logs (
    eventVersion STRING,
    userIdentity STRUCT<
        type: STRING,
        principalId: STRING,
        arn: STRING,
        accountId: STRING,
        invokedBy: STRING,
        accessKeyId: STRING,
        userName: STRING,
        sessionContext: STRUCT<
            attributes: STRUCT<
                mfaAuthenticated: STRING,
                creationDate: STRING>,
            sessionIssuer: STRUCT<
                type: STRING,
                principalId: STRING,
                arn: STRING,
                accountId: STRING,
                userName: STRING>>>,
    eventTime STRING,
    eventSource STRING,
    eventName STRING,
    awsRegion STRING,
    sourceIpAddress STRING,
    userAgent STRING,
    errorCode STRING,
    errorMessage STRING,
    requestParameters STRING,
    responseElements STRING,
    additionalEventData STRING,
    requestId STRING,
    eventId STRING,
    resources ARRAY<STRUCT<
        arn: STRING,
        accountId: STRING,
        type: STRING>>,
    eventType STRING,
    apiVersion STRING,
    readOnly STRING,
    recipientAccountId STRING,
    serviceEventDetails STRING,
    sharedEventID STRING,
    vpcEndpointId STRING
)
COMMENT 'CloudTrail table for cloudtrail bucket'
PARTITIONED BY (
  `account` string,
  `region` string,
  `date` string
  )
ROW FORMAT SERDE 'com.amazon.emr.hive.serde.CloudTrailSerde'
STORED AS INPUTFORMAT 'com.amazon.emr.cloudtrail.CloudTrailInputFormat'
OUTPUTFORMAT 'org.apache.hadoop.hive.ql.io.HiveIgnoreKeyTextOutputFormat'
LOCATION 's3://<<YOUR_BUCKET_NAME>>/AWSLogs/<<YOUR_ORGANIZATIONS_ID>>/'
TBLPROPERTIES (
    'projection.enabled' = 'true',
    'projection.date.type' = 'date',
    'projection.date.range' = 'NOW-3YEARS,NOW',
    'projection.date.format' = 'yyyy/MM/dd',
    'projection.date.interval' = '1',
    'projection.date.interval.unit' = 'DAYS',
    'projection.region.type' = 'enum',
    'projection.region.values'='ap-northeast-1,ap-northeast-2,ap-northeast-3,ap-south-1,ap-southeast-1,ap-southeast-2,ca-central-1,eu-central-1,eu-north-1,eu-west-1,eu-west-2,eu-west-3,sa-east-1,us-east-1,us-east-2,us-west-1,us-west-2',
    'projection.account.type' = 'enum',
    'projection.account.values' = '123456789012,234567890123',
    'storage.location.template' = 's3://<<YOUR_BUCKET_NAME>>/AWSLogs/<<YOUR_ORGANIZATIONS_ID>>/${account}/CloudTrail/${region}/${date}',
'compressionType'='gzip',
'typeOfData'='file',
'classification'='cloudtrail'
);
