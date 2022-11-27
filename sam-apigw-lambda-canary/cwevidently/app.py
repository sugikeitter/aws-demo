import json

import boto3

evidently = boto3.client('evidently')

def lambda_handler(event, context):
  entityId = 'No entityId'
  if event.get('queryStringParameters') != None:
    entityId = event.get('queryStringParameters', {}).get('entityId', 'No entityId')
  # response examle
  # {
  #   "details": {},
  #   "reason": "DEFAULT",
  #   "value": "{ 
  #         "boolValue": "false" 
  #       }",
  #   "valueType": "BOOLEAN",
  #   "variation": "off",
  # }
  res = evidently.evaluate_feature(
    entityId=entityId,
    feature='boolFeature',
    project='demo'
  )

  featureFlagVariation = res.get('variation', '')
  msg = ''
  if res.get('value', {}).get('boolValue', False):
    msg = 'あなたはラッキー！特別に割引を提供します😻'

  return {
      'statusCode': 200,
      'body': json.dumps({
        'entityId': entityId,
        'msg': msg,
        'featureFlagVariation': featureFlagVariation
      },
      ensure_ascii=False,
      indent=2),
  }