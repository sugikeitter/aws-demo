import sys
import botocore
import boto3
from botocore.config import Config

# python throttling_sdk_retry.py |& grep -v "Not retrying request"
boto3.set_stream_logger('botocore.retries.standard', format_string="[%(levelname)s] %(message)s")
dynamodb_resource = boto3.resource('dynamodb', config=Config(retries={'mode': 'standard', 'total_max_attempts': 3}))
table = dynamodb_resource.Table('demoThrottling')

def get_item_result():
    try:
        response = table.get_item(
            Key={'id': '001'},
            ConsistentRead=True, # True/False
            ReturnConsumedCapacity='TOTAL'
        )
        return response['ResponseMetadata']['HTTPStatusCode'], 'OK'
        # return response['ResponseMetadata']['HTTPStatusCode']
    except botocore.exceptions.ClientError as e:
        # print(e)
        return e.response['ResponseMetadata']['HTTPStatusCode'], e.response['Error']['Code']
        # return 'ProvisionedThroughputExceededException'


if __name__ == '__main__':
    for i in range(100):
        code, result = get_item_result()
        print('StatusCode=' + str(code) + ', Result=' + result, file=sys.stderr)
