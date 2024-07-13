# for Amazon Linux 2023
sudo dnf install git tree vim bash-completion
## TODO envsubst

# TODO install tools / kubect, aws-cli, eksctl, helm ...

## kubectl
curl -LO "https://dl.k8s.io/release/$(curl -L -s https://dl.k8s.io/release/stable.txt)/bin/linux/amd64/kubectl"
curl -LO "https://dl.k8s.io/release/$(curl -L -s https://dl.k8s.io/release/stable.txt)/bin/linux/amd64/kubectl.sha256"
echo "$(cat kubectl.sha256)  kubectl" | sha256sum --check

sudo install -o root -g root -m 0755 kubectl /usr/local/bin/kubectl

## helm
curl -fsSL -o get_helm.sh https://raw.githubusercontent.com/helm/helm/main/scripts/get-helm-3
chmod 700 get_helm.sh
./get_helm.sh

## aws-cli
curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip"
unzip awscliv2.zip
sudo ./aws/install

## eksctl
# for ARM systems, set ARCH to: `arm64`, `armv6` or `armv7`
ARCH=amd64
PLATFORM=$(uname -s)_$ARCH

curl -sLO "https://github.com/eksctl-io/eksctl/releases/latest/download/eksctl_$PLATFORM.tar.gz"

### (Optional) Verify checksum
curl -sL "https://github.com/eksctl-io/eksctl/releases/latest/download/eksctl_checksums.txt" | grep $PLATFORM | sha256sum --check

tar -xzf eksctl_$PLATFORM.tar.gz -C /tmp && rm eksctl_$PLATFORM.tar.gz

sudo mv /tmp/eksctl /usr/local/bin

## argocd cli
VERSION=$(curl -L -s https://raw.githubusercontent.com/argoproj/argo-cd/stable/VERSION)
curl -sSL -o argocd-linux-amd64 https://github.com/argoproj/argo-cd/releases/download/v$VERSION/argocd-linux-amd64
sudo install -m 555 argocd-linux-amd64 /usr/local/bin/argocd
rm argocd-linux-amd64


# prepare Karpenter
## Change settings
export KARPENTER_VERSION="0.37.0"
export EKS_CLUSTER_NAME=xxxx # TODO
export TEMPOUT="$(mktemp)"

## Prepare resources used by Karpenter (https://karpenter.sh/v0.37/getting-started/getting-started-with-karpenter/)
curl -fsSL https://raw.githubusercontent.com/aws/karpenter-provider-aws/v"${KARPENTER_VERSION}"/website/content/en/preview/getting-started/getting-started-with-karpenter/cloudformation.yaml  > "${TEMPOUT}"
sed -i "s/QueueName: \!Sub \"/QueueName: \!Sub \"karpenter-interruption-/" "${TEMPOUT}"
## Create some AWS resources like IAM Roles, SQS queues
aws cloudformation deploy \
  --stack-name "Karpenter-${EKS_CLUSTER_NAME}" \
  --template-file "${TEMPOUT}" \
  --capabilities CAPABILITY_NAMED_IAM \
  --parameter-overrides "ClusterName=${EKS_CLUSTER_NAME}"

aws iam create-service-linked-role --aws-service-name spot.amazonaws.com || true
### If the role has already been successfully created, you will see:
### An error occurred (InvalidInput) when calling the CreateServiceLinkedRole operation: Service role name AWSServiceRoleForEC2Spot has been taken in this account, please try a different suffix.

# Create EKS Cluster with Karpenter settings
export AWS_ACCOUNT_ID="$(aws sts get-caller-identity --query Account --output text)"
export PRIVATE_SUBNET_DEF_1="ap-northeast-1a: { id: subnet-xxxxxx }" # TODO
export PRIVATE_SUBNET_DEF_2="ap-northeast-1c: { id: subnet-xxxxxx }" # TODO
export PRIVATE_SUBNET_DEF_3="ap-northeast-1d: { id: subnet-xxxxxx }" # TODO
## eksctl create cluster
curl -fsSL https://raw.githubusercontent.com/sugikeitter/aws-demo/main/eksctl-create-cluster/existing-vpc-cluster/eksctl-cluster-with-karpenter-config-example.yaml | envsubst | eksctl create cluster -f -

# If you add Cluster admin
export ROLE_ARN="arn:aws:iam::${AWS_ACCOUNT_ID}:role/xxx" # TODO
aws eks create-access-entry --cluster-name defaultvpc-eksctl --principal-arn $ROLE_ARN --type STANDARD
aws eks associate-access-policy --cluster-name $EKS_CLUSTER_NAME \
  --principal-arn $ROLE_ARN  \
  --policy-arn arn:aws:eks::aws:cluster-access-policy/AmazonEKSClusterAdminPolicy
  --access-scope type=cluster

# create kubeconfig
aws eks update-kubeconfig --name $EKS_CLUSTER_NAME

# TODO Create VPC/subnet and tag to subnet
## Private subnet tags
# kubernetes.io/role/internal-elb 1 # To use internal ELB by AWS LB Contorller
# karpenter.sh/discovery $EKS_CLUSTER_NAME # To use Karpentar

## Public subnet tags
# kubernetes.io/role/elb 1 # To use internet-facing ELB by AWS LB Contorller
# karpenter.sh/discovery $EKS_CLUSTER_NAME # To use Karpentar


# Client setup to use EKS Cluster
mkdir ~/.bashrc.d
## k8s
cat << EOT >> ~/.bashrc.d/kubectl_completion.bash

# alias and auto comp
alias vi=vim
alias k=kubectl
complete -F __start_kubectl k

# short alias to set/show context/namespace (only works for bash and bash-compatible shells, current context to be set before using kn to set namespace)
alias kx='f() { [ "\$1" ] && kubectl config use-context \$1 || kubectl config current-context ; } ; f'
alias kn='f() { [ "\$1" ] && kubectl config set-context --current --namespace \$1 || kubectl config view --minify | grep namespace | cut -d" " -f6 ; } ; f'
export dry='--dry-run=client -o yaml'
# Use bash-completion, if available
if [[ -f /usr/share/bash-completion/bash_completion ]]; then
   source /usr/share/bash-completion/bash_completion;
fi

export KUBE_EDITOR=/usr/bin/vim
EOT

source ~/.bashrc


################

# Add AWS Load Balancer Contoroller (https://kubernetes-sigs.github.io/aws-load-balancer-controller)
curl -o iam-policy.json https://raw.githubusercontent.com/kubernetes-sigs/aws-load-balancer-controller/v2.8.1/docs/install/iam_policy.json

aws iam create-policy \
    --policy-name AWSLoadBalancerControllerIAMPolicy \
    --policy-document file://iam-policy.json

## TODO use pod identity
eksctl create iamserviceaccount \
  --cluster=$EKS_CLUSTER_NAME \
  --namespace=kube-system \
  --name=aws-load-balancer-controller \
  --role-name AmazonEKSLoadBalancerControllerRole \
  --attach-policy-arn=arn:aws:iam::`aws sts get-caller-identity --output text --query "Account"`:policy/AWSLoadBalancerControllerIAMPolicy \
  --approve


export LOAD_BALANCER_CONTROLER_HELM_CHART_VERSION=1.8.1 # TODO Change version
helm repo add eks https://aws.github.io/eks-charts
helm install aws-load-balancer-controller eks/aws-load-balancer-controller \
  -n kube-system \
  -version ${LOAD_BALANCER_CONTROLER_HELM_CHART_VERSION} \
  --set clusterName=$EKS_CLUSTER_NAME \
  --set serviceAccount.create=false \
  --set serviceAccount.name=aws-load-balancer-controller 

# Set up Argo CD
## Refer https://github.com/sugikeitter/argocd-example/blob/main/setup.sh

# After setup Argo CD, manage aws-load-balancer-controller in Argo CD
cat <<EOF | kubectl apply -f -
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: aws-load-balancer-controller
  namespace: argocd
spec:
  project: default
  source:
    repoURL: 'https://aws.github.io/eks-charts'
    targetRevision: ${LOAD_BALANCER_CONTROLER_HELM_CHART_VERSION} 
    chart: aws-load-balancer-controller
    helm:
      parameters:
      - name: "clusterName"
        value: ${EKS_CLUSTER_NAME}
      - name: "serviceAccount.create"
        value: "false"
      - name: "serviceAccount.name"
        value: aws-load-balancer-controller
  destination:
    server: 'https://kubernetes.default.svc'
    namespace: kube-system
  syncPolicy:
    automated:
      prune: true
      selfHeal: true
EOF

# Setup Karpenter

## Change Karpenter settings
EKS_CLUSTER_NAME=xxxx # TODO
KARPENTER_QUEUE_NAME=karpenter-interruption-${EKS_CLUSTER_NAME} #
KARPENTER_VERSION=0.37.0
KARPENTER_NODE_AMI_FAMILY=Bottlerocket
KARPENTER_NODE_ROLE=KarpenterNodeRole-${EKS_CLUSTER_NAME}
KARPENTER_NODE_SG_NAME=eks-cluster-sg-xxx # TODO set existing sg

#### Create ArgoCD resource####
cat <<EOF | kubectl apply -f -
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: karpenter
  namespace: argocd
spec:
  project: default
  source:
    repoURL: 'public.ecr.aws/karpenter'
    targetRevision: ${KARPENTER_VERSION} # TODO Change version
    chart: karpenter
    helm:
      parameters:
      - name: "settings.clusterName"
        value: ${EKS_CLUSTER_NAME}
      - name: "settings.interruptionQueue"
        value: ${KARPENTER_QUEUE_NAME}
      - name: "controller.resources.requests.cpu"
        value: "1"
      - name: "controller.resources.requests.memory"
        value: 1Gi
      - name: "controller.resources.limits.cpu"
        value: "1"
      - name: "controller.resources.limits.memory"
        value: 1Gi
  destination:
    server: 'https://kubernetes.default.svc'
    namespace: kube-system
  syncPolicy:
    automated:
      prune: true
      selfHeal: true
EOF

# # Or using Helm manually
# ## Logout of helm registry to perform an unauthenticated pull against the public ECR
# helm registry logout public.ecr.aws
# helm upgrade --install karpenter oci://public.ecr.aws/karpenter/karpenter --version "${KARPENTER_VERSION}" --namespace "kube-system" --create-namespace \
#   --set "settings.clusterName=${EKS_CLUSTER_NAME}" \
#   --set "settings.interruptionQueue=${KARPENTER_QUEUE_NAME}" \
#   --set controller.resources.requests.cpu=1 \
#   --set controller.resources.requests.memory=1Gi \
#   --set controller.resources.limits.cpu=1 \
#   --set controller.resources.limits.memory=1Gi \
#   --wait


## Create NodePool and EC2NodeClass
export K8S_VERSION="1.30" # TODO
# TODO manage by Argo CD
cat <<EOF | kubectl apply -f -
apiVersion: karpenter.sh/v1beta1
kind: NodePool
metadata:
  name: default
spec:
  template:
    spec:
      requirements:
        - key: kubernetes.io/arch
          operator: In
          values: ["amd64"]
        - key: kubernetes.io/os
          operator: In
          values: ["linux"]
        - key: karpenter.sh/capacity-type
          operator: In
          values: ["spot"]
        - key: karpenter.k8s.aws/instance-category
          operator: In
          values: ["c", "m", "r"]
        - key: karpenter.k8s.aws/instance-size
          operator: In
          values: ["xlarge"]
        - key: karpenter.k8s.aws/instance-generation
          operator: Gt
          values: ["5"]
      nodeClassRef:
        apiVersion: karpenter.k8s.aws/v1beta1
        kind: EC2NodeClass
        name: default
  limits:
    cpu: 1000
  disruption:
    consolidationPolicy: WhenUnderutilized
    expireAfter: 720h # 30 * 24h = 720h
---
apiVersion: karpenter.k8s.aws/v1beta1
kind: EC2NodeClass
metadata:
  name: default
spec:
  amiFamily: ${KARPENTER_NODE_AMI_FAMILY}
  role: ${KARPENTER_NODE_ROLE}
  subnetSelectorTerms:
    - tags:
        karpenter.sh/discovery: ${EKS_CLUSTER_NAME}
  securityGroupSelectorTerms:
    - tags:
        Name: ${KARPENTER_NODE_SG_NAME}
#   amiSelectorTerms:
#     - id: "${ARM_AMI_ID}"
#     - id: "${AMD_AMI_ID}"
# #   - id: "${GPU_AMI_ID}" # <- GPU Optimized AMD AMI 
# #   - name: "amazon-eks-node-${K8S_VERSION}-*" # <- automatically upgrade when a new AL2 EKS Optimized AMI is released. This is unsafe for production workloads. Validate AMIs in lower environments before deploying them to production.
EOF

# Setup metric server by argocd
cat <<EOF | kubectl apply -f -
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: metrics-server
  namespace: argocd
spec:
  project: default
  source:
    repoURL: 'https://kubernetes-sigs.github.io/metrics-server/'
    targetRevision: 3.12.1
    chart: metrics-server
  destination:
    server: 'https://kubernetes.default.svc'
    namespace: kube-system
  syncPolicy:
    automated:
      prune: true
      selfHeal: true
EOF

# Setup CloudWatch Container Insights EKS add-on
aws iam attach-role-policy \
--role-name ${NODE_ROLE} \ # Managed node group & karpentar node
--policy-arn arn:aws:iam::aws:policy/CloudWatchAgentServerPolicy

kubectl create ns amazon-cloudwatch

eksctl create podidentityassociation \
    --cluster ${EKS_CLUSTER_NAME} \
    --namespace amazon-cloudwatch \
    --service-account-name cloudwatch-agent \
    --permission-policy-arns="arn:aws:iam::aws:policy/CloudWatchAgentServerPolicy" \
    --role-name EKSContainerInsightsSARole 
#    --permission-policy-arns="arn:aws:iam::${AWS_ACCOUNT_ID}:policy/CloudWatchAgentServerPolicy, arn:aws:iam::${AWS_ACCOUNT_ID}:policy/xxxx" \
#    --well-known-policies="autoScaler,externalDNS" \

aws eks create-addon --cluster-name ${EKS_CLUSTER_NAME} --addon-name amazon-cloudwatch-observability
