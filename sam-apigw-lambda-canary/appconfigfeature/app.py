from datetime import datetime, timedelta
import json

import boto3

APPCONFIG_APPLICATION_NAME = "demoAppCofig"
APPCONFIG_CONFIG_PROFILE_NAME = "demoFeatureFlag"
APPCONFIG_ENVIRONMENT_NAME = "demoEnv"
AWS_REGION = "ap-northeast-1"

cached_config_data = {}
cached_config_token = None
cached_token_expiration_time = None

appconfigdata = boto3.client("appconfigdata", region_name=AWS_REGION)

def lambda_handler(event, context):
  return {
      'statusCode': 200,
      'body': json.dumps(get_config(),
      ensure_ascii=False,
      indent=2),
  }

# https://aws.amazon.com/blogs/mt/using-aws-appconfig-feature-flags/
def get_config():
    global cached_config_token
    global cached_config_data
    global cached_token_expiration_time
    
    # If we don't have a token yet, call start_configuration_session to get one
    if not cached_config_token or datetime.now() >= cached_token_expiration_time:
        start_session_response = appconfigdata.start_configuration_session(
            ApplicationIdentifier=APPCONFIG_APPLICATION_NAME,
            EnvironmentIdentifier=APPCONFIG_ENVIRONMENT_NAME,
            ConfigurationProfileIdentifier=APPCONFIG_CONFIG_PROFILE_NAME,
        )
        cached_config_token = start_session_response["InitialConfigurationToken"]

    get_config_response = appconfigdata.get_latest_configuration(
        ConfigurationToken=cached_config_token
    )
    print("get_config_response:", get_config_response)

    # Response always includes a fresh token to use in next call
    cached_config_token = get_config_response["NextPollConfigurationToken"]
    # Token will expire if not refreshed within 24 hours, so keep track of
    # the expected expiration time minus a bit of padding
    cached_token_expiration_time = datetime.now() + timedelta(hours=23, minutes=59)
    # 'Configuration' in the response will only be populated the first time we
    # call GetLatestConfiguration or if the config contents have changed since
    # the last time we called. So if it's empty we know we already have the latest
    # config, otherwise we need to update our cache.
    content = get_config_response["Configuration"].read()
    if content:
        try:
            cached_config_data = json.loads(content.decode("utf-8"))
            print("received new config data:", cached_config_data)
        except json.JSONDecodeError as error:
            raise ValueError(error.msg) from error

    print("cached_config_data:", cached_config_data)
    return cached_config_data

    