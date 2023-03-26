```sql
CREATE EXTERNAL TABLE `aws_waf_logs_demo_partition_projection`(
  `timestamp` bigint COMMENT 'from deserializer', 
  `formatversion` int COMMENT 'from deserializer', 
  `webaclid` string COMMENT 'from deserializer', 
  `terminatingruleid` string COMMENT 'from deserializer', 
  `terminatingruletype` string COMMENT 'from deserializer', 
  `action` string COMMENT 'from deserializer', 
  `terminatingrulematchdetails` array<struct<conditiontype:string,location:string,matcheddata:array<string>>> COMMENT 'from deserializer', 
  `httpsourcename` string COMMENT 'from deserializer', 
  `httpsourceid` string COMMENT 'from deserializer', 
  `rulegrouplist` array<struct<rulegroupid:string,terminatingrule:struct<ruleid:string,action:string,rulematchdetails:string>,nonterminatingmatchingrules:array<string>,excludedrules:string>> COMMENT 'from deserializer', 
  `ratebasedrulelist` array<string> COMMENT 'from deserializer', 
  `nonterminatingmatchingrules` array<string> COMMENT 'from deserializer', 
  `requestheadersinserted` string COMMENT 'from deserializer', 
  `responsecodesent` string COMMENT 'from deserializer', 
  `httprequest` struct<clientip:string,country:string,headers:array<struct<name:string,value:string>>,uri:string,args:string,httpversion:string,httpmethod:string,requestid:string> COMMENT 'from deserializer', 
  `labels` array<struct<name:string>> COMMENT 'from deserializer')
PARTITIONED BY ( 
  `yymmdd` string)
ROW FORMAT SERDE 
  'org.openx.data.jsonserde.JsonSerDe' 
WITH SERDEPROPERTIES ( 
  'paths'='action,formatVersion,httpRequest,httpSourceId,httpSourceName,labels,nonTerminatingMatchingRules,rateBasedRuleList,requestHeadersInserted,responseCodeSent,ruleGroupList,terminatingRuleId,terminatingRuleMatchDetails,terminatingRuleType,timestamp,webaclId') 
STORED AS INPUTFORMAT 
  'org.apache.hadoop.mapred.TextInputFormat' 
OUTPUTFORMAT 
  'org.apache.hadoop.hive.ql.io.HiveIgnoreKeyTextOutputFormat'
LOCATION
  's3://<<YOUR_BUCKET_NAME>>/'
TBLPROPERTIES (
  'CrawlerSchemaDeserializerVersion'='1.0', 
  'CrawlerSchemaSerializerVersion'='1.0', 
  'averageRecordSize'='1718', 
  'classification'='json', 
  'compressionType'='gzip', 
  'objectCount'='3523', 
  'projection.enabled'='true', 
  'projection.yymmdd.format'='yyyy/MM/dd', 
  'projection.yymmdd.interval'='1', 
  'projection.yymmdd.interval.unit'='DAYS', 
  'projection.yymmdd.range'='2020/10/01,NOW', 
  'projection.yymmdd.type'='date', 
  'storage.location.template'='s3://<<YOUR_BUCKET_NAME>>/${yymmdd}', 
--   'storage.location.template'='s3://<<YOUR_BUCKET_NAME>>/AWSLogs/<<YOUR_ACCOUNT_ID>>/WAF/<<REGION_CODE>>/${yymmdd}', -- For SIEM on AWS Bucket
  'typeOfData'='file')
```

```sql
SELECT
  DATE_FORMAT(FROM_UNIXTIME(timestamp/1000, 'Asia/Tokyo') ,'%Y-%m-%d %h:%i:%s') as JST
FROM "default"."aws_waf_logs_demo_partition_projection"
LIMIT 10;
```
