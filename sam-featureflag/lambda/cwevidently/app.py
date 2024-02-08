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
  msg = 'ようこそ！'
  if res.get('value', {}).get('boolValue', False):
    msg = 'あなたには新しい画面をお見せしています🎨'

  return {
      'statusCode': 200,
      'body': json.dumps({
        'title': 'Cloud Watch Evidently の動作確認 API',
        'entityId': entityId,
        'featureFlagVariation': featureFlagVariation,
        'msg': msg,
      },
      ensure_ascii=False,
      indent=2),
  }
