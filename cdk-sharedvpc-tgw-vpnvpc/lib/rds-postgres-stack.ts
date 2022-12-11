import {
  App,
  Stack,
  StackProps,
  aws_ec2 as ec2,
  aws_rds as rds,
} from 'aws-cdk-lib';
import { Construct } from 'constructs';

export interface RdsPostgresStackProps extends StackProps {
  vpc: ec2.Vpc;
}

export class RdsPostgresStack extends Stack {
  public readonly dbClientSg: ec2.SecurityGroup;
  public readonly dbServerSg: ec2.SecurityGroup;
  public readonly dbInstancePostgres: rds.DatabaseInstance;
  public readonly rdsSecretName: string;
  constructor(scope: App, id: string, props: RdsPostgresStackProps) {
    super(scope, id, props);

    this.dbClientSg = new ec2.SecurityGroup(this, 'Sg-PostgresClient', {
      securityGroupName: 'Sg-PostgresClient',
      vpc: props.vpc,
    });
    this.dbServerSg = new ec2.SecurityGroup(this, 'Sg-Postgres', {
      securityGroupName: 'Sg-Postgres',
      vpc: props.vpc,
    });
    this.dbServerSg.addIngressRule(this.dbClientSg, ec2.Port.tcp(5432));
    // TODO INを許可するSGをEC2/ECSから連携する
    this.dbInstancePostgres = new rds.DatabaseInstance(this, "RdsPostgres", {
      instanceIdentifier: 'cdk-postgres',
      engine: rds.DatabaseInstanceEngine.postgres({ version: rds.PostgresEngineVersion.VER_14_4 }),
      vpc: props.vpc,
      multiAz: true,
      instanceType: ec2.InstanceType.of(ec2.InstanceClass.T3, ec2.InstanceSize.SMALL),
      storageType: rds.StorageType.GP2,
      securityGroups: [this.dbServerSg],
    });
    if (this.dbInstancePostgres.secret) {
      this.rdsSecretName = this.dbInstancePostgres.secret.secretName;
    }
  }
}