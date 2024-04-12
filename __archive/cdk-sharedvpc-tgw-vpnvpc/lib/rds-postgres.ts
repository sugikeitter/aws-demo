import {
  aws_ec2 as ec2,
  aws_rds as rds,
} from 'aws-cdk-lib';
import { Construct } from 'constructs';

export interface RdsPostgresProps {
  vpc: ec2.Vpc;
}

export class RdsPostgres extends Construct {
  public readonly dbClientSg: ec2.SecurityGroup;
  public readonly dbServerSg: ec2.SecurityGroup;
  public readonly dbInstancePostgres: rds.DatabaseInstance;
  public readonly rdsSecretName: string;
  constructor(scope: Construct, id: string, props: RdsPostgresProps) {
    super(scope, id);

    // この SG は EC2/ECS で使用する
    this.dbClientSg = new ec2.SecurityGroup(this, 'Sg-PostgresClient', {
      securityGroupName: 'Sg-PostgresClient',
      vpc: props.vpc,
    });

    this.dbServerSg = new ec2.SecurityGroup(this, 'Sg-Postgres', {
      securityGroupName: 'Sg-Postgres',
      vpc: props.vpc,
    });
    this.dbServerSg.addIngressRule(this.dbClientSg, ec2.Port.tcp(5432));

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