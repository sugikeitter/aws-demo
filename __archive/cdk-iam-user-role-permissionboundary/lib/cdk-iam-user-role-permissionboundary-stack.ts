import * as cdk from 'aws-cdk-lib';
import {
  aws_iam as iam,
} from 'aws-cdk-lib';
import { Construct } from 'constructs';

export class CdkIamUserRolePermissionboundaryStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: cdk.StackProps) {
    super(scope, id, props);


    // TODO 権限がEC2のReadOnlyのIAMユーザーをdemo-ec2-readonlyという名前で作成
    const ec2ReadonlyUser = new iam.User(this, 'DemoUserEc2ReadOnly', {
      userName: 'demo-ec2-readonly',
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonEC2ReadOnlyAccess'),
      ],
    });

    // demo-ec2-readonlyが、EC2のReadOnly+起動/停止したい場合にAssumeするロール（EC2にアタッチできるプロファイルはAmazonSSMRoleForInstancesQuickSetupのみに絞っている）
    const role = new iam.Role(this, 'DemoRoleForEC2RunStartStop', {
      roleName: 'DemoRoleForEC2RunStartStop',
      assumedBy: new iam.ArnPrincipal(ec2ReadonlyUser.userArn),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonEC2ReadOnlyAccess'),
      ],
      // EC2インスタンス起動のためにRoleを作成できてしまうポリシーが割り当てられている
      inlinePolicies: {
        'ec2RunStartStop': iam.PolicyDocument.fromJson({
          "Version": "2012-10-17",
          "Statement": [
            {
              "Effect": "Allow",
              "Action": [
                "ec2:RunInstances",
                "ec2:CreateTags",
                "ec2:StartInstances",
                "ec2:StopInstances",
                "iam:ListInstanceProfiles",
                "iam:GetRole",
                // "iam:PassRole",
                // "iam:CreateRole",
                // "iam:CreateInstanceProfile",
                "iam:ListPolicies",
                "iam:ListRoles",
                "iam:AttachRolePolicy"
              ],
              "Resource": "*"
            },
            {
              "Effect": "Allow",
              "Action": [
                "iam:PassRole"
              ],
              "Resource": [
                "arn:aws:iam::" + props.env?.account + ":role/AmazonSSMRoleForInstancesQuickSetup"
              ],
              "Condition": {
                "StringEquals": {"iam:PassedToService": "ec2.amazonaws.com"},
              }
            }
          ]
        })
      },
    });

    const policyForBoundary = new iam.ManagedPolicy(this, 'policyForBoundary', {
      managedPolicyName: 'DemoPlicyForBoundary',
      document: iam.PolicyDocument.fromJson({
        "Version": "2012-10-17",
        "Statement": [
          {
            "Effect": "Allow",
            "Action": [
              "ec2:Describe*",
              "ec2:RunInstances",
              "ec2:CreateTags",
              "ec2:StartInstances",
              "ec2:StopInstances",
              "dynamodb:*",
              "iam:Get*",
              "iam:List*",
              "iam:AddRoleToInstanceProfile", // TODO ここで好きなポリシー付いたロールを自分で作成したInstanceProfileに設定できてしまわない？
              "iam:CreateInstanceProfile",
              // "iam:PassRole", // EC2, Lambdaのみ、特定の名前のロールならOKのConditionを下で設定
              // "iam:CreateRole", // Permission Boundary付きで特定の名前のロールのみOKを下で設定
              // "iam:AttachRolePolicy", // Permission Boundary付きで特定の名前のロールのみOKを下で設定
            ],
            "Resource": "*"
          },
          {
            "Sid": "PassSpecificNameRole",
            "Effect": "Allow",
            "Action": [
              "iam:PassRole"
            ],
            "Resource": [
              "arn:aws:iam::" + props.env?.account + ":role/demoBoundaryRole*",
              "arn:aws:iam::" + props.env?.account + ":role/AmazonSSMRoleForInstancesQuickSetup"
            ],
            "Condition": {
              "StringEquals": {
                "iam:PassedToService": [
                  "ec2.amazonaws.com",
                  "lambda.amazonaws.com"
                ]
              }
            }
          },
          {
            "Sid": "RoleCreationWithPrefixAndBoundary",
            "Effect": "Allow",
            "Action": [
              "iam:CreateRole",
              "iam:AttachRolePolicy",
            ],
            "Resource": [
              "arn:aws:iam::" + props.env?.account + ":role/demoBoundaryRole*"
            ],
            "Condition": {
              "StringEquals": {
                "iam:PermissionsBoundary": "arn:aws:iam::" + props.env?.account + ":policy/DemoPlicyForBoundary"
              }
            }
          },
          {
            "Sid": "DenyPermBoundaryIAMPolicyAlteration",
            "Effect": "Deny",
            "Action": [
              "iam:DeletePolicy",
              "iam:DeletePolicyVersion",
              "iam:CreatePolicyVersion",
              "iam:SetDefaultPolicyVersion"
            ],
            "Resource": [
              "arn:aws:iam::" + props.env?.account + ":policy/DemoPlicyForBoundary"
            ]
          },
          {
            "Sid": "DenyRemovalOfPermBoundaryFromAnyUserOrRole",
            "Effect": "Deny",
            "Action": [
              "iam:DeleteUserPermissionsBoundary",
              "iam:DeleteRolePermissionsBoundary"
            ],
            "Resource": [
              "arn:aws:iam::" + props.env?.account + ":user/*",
              "arn:aws:iam::" + props.env?.account + ":role/*"
            ],
            "Condition": {
              "StringEquals": {
                "iam:PermissionsBoundary": "arn:aws:iam::" + props.env?.account + ":policy/DemoPlicyForBoundary"
              }
            }
          },
          {
            "Sid": "DenyAccessIfRequiredPermBoundaryIsNotBeingApplied",
            "Effect": "Deny",
            "Action": [
              "iam:PutUserPermissionsBoundary",
              "iam:PutRolePermissionsBoundary",
              "iam:CreateUser"
            ],
            "Resource": [
              "arn:aws:iam::" + props.env?.account + ":user/*",
              "arn:aws:iam::" + props.env?.account + ":role/*"
            ],
            "Condition": {
              "StringNotEquals": {
                "iam:PermissionsBoundary": "arn:aws:iam::" + props.env?.account + ":policy/DemoPlicyForBoundary"
              }
            }
          }
        ]
      })
    });

    const roleWithPermissionBoundary = new iam.Role(this, 'DemoRoleForEC2RunStartStopWithPermBooundary', {
      roleName: 'DemoRoleForEC2RunStartStopWithPermBooundary',
      assumedBy: new iam.ArnPrincipal('arn:aws:iam::' + props.env?.account + ':user/demo-ec2-readonly'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonEC2ReadOnlyAccess'),
      ],
      // EC2インスタンス起動のためにRoleを作成できてしまうポリシーが割り当てられているが、PermissionBoundaryが付いている
      inlinePolicies: {
        "ec2RunStartStop": iam.PolicyDocument.fromJson({
          "Version": "2012-10-17",
          "Statement": [
            {
              "Effect": "Allow",
              "Action": [
                "ec2:RunInstances",
                "ec2:CreateTags",
                "ec2:StartInstances",
                "ec2:StopInstances",
                "iam:Get*",
                "iam:List*",
                "iam:AddRoleToInstanceProfile",
                "iam:AttachRolePolicy",
                "iam:CreateInstanceProfile",
                "iam:CreateInstanceProfile",
                "iam:CreateRole",
                "iam:PassRole",
              ],
              "Resource": "*"
            }
          ]
        })
      },
      permissionsBoundary: policyForBoundary
    });


    // 作成したロールをIAMユーザーがAssumeRoleするポリシー
    const inlinePolicy = new iam.Policy(this, 'DemoEc2UserInline', {
      policyName: 'assumeDemoRole',
      users: [ec2ReadonlyUser],
      document: iam.PolicyDocument.fromJson({
        "Version": "2012-10-17",
        "Statement": [
          {
            "Sid": "VisualEditor0",
            "Effect": "Allow",
            "Action": "s3:ListAllMyBuckets",
            "Resource": "*"
          },
          {
            "Sid": "VisualEditor1",
            "Effect": "Allow",
            "Action": "sts:AssumeRole",
            "Resource": [
              role.roleArn,
              roleWithPermissionBoundary.roleArn
            ],
            "Condition": {
              "BoolIfExists": {
                "aws:MultiFactorAuthPresent": "true"
              }
            }
          }
        ]
      }),
    });
  }
}
