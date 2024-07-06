# for Amazon Linux 2023
sudo dnf install git tree vim bash-completion
## TODO envsubst


## TODO prepare Karpentar
# https://karpenter.sh/v0.37/getting-started/getting-started-with-karpenter/
# 
# https://karpenter.sh/v0.37/reference/cloudformation/ (https://github.com/aws/karpenter-provider-aws/blob/main/website/content/en/preview/getting-started/getting-started-with-karpenter/cloudformation.yaml)
# https://github.com/aws/karpenter-provider-aws/tree/main/charts/karpenter
# or ↓
# 
# 


# TODO Create VPC/subnet and tag to subnet
# ## Private subnet tags
# kubernetes.io/role/internal-elb 1 # To use internal ELB by AWS LB Contorller
# karpenter.sh/discovery $CLUSTER_NAME??

# ## Public subnet tags
# kubernetes.io/role/elb 1 # To use internet-facing ELB by AWS LB Contorller
# karpenter.sh/discovery $CLUSTER_NAME??


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


# Cluster setup
mkdir ~/.bashrc.d
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

export EKS_CLUSTER_NAME=eks-demo
# If you don't have EKS cluster, create EKS cluster
# curl -fsSL https://raw.githubusercontent.com/sugikeitter/aws-demo/main/eksctl-create-cluster/existing-vpc-cluster/eksctl-cluster-config-example.yaml | envsubst | eksctl create cluster -f -

# If you add Cluster admin
ROLE_ARN= arn:aws:iam::123456789012:role/xxx
aws eks create-access-entry --cluster-name defaultvpc-eksctl --principal-arn $ROLE_ARN --type STANDARD
aws eks associate-access-policy --cluster-name $EKS_CLUSTER_NAME \
  --principal-arn $ROLE_ARN  \
  --policy-arn arn:aws:eks::aws:cluster-access-policy/AmazonEKSClusterAdminPolicy
  --access-scope type=cluster

# create kubeconfig
aws eks update-kubeconfig --name $EKS_CLUSTER_NAME


################

# Add AWS Load Balancer Contoroller (https://kubernetes-sigs.github.io/aws-load-balancer-controller)

curl -o iam-policy.json https://raw.githubusercontent.com/kubernetes-sigs/aws-load-balancer-controller/v2.8.1/docs/install/iam_policy.json

aws iam create-policy \
    --policy-name AWSLoadBalancerControllerIAMPolicy \
    --policy-document file://iam-policy.json

eksctl create iamserviceaccount \
  --cluster=$EKS_CLUSTER_NAME \
  --namespace=kube-system \
  --name=aws-load-balancer-controller \
  --role-name AmazonEKSLoadBalancerControllerRole \
  --attach-policy-arn=arn:aws:iam::`aws sts get-caller-identity --output text --query "Account"`:policy/AWSLoadBalancerControllerIAMPolicy \
  --approve

helm repo add eks https://aws.github.io/eks-charts

helm install aws-load-balancer-controller eks/aws-load-balancer-controller \
  -n kube-system \
  --set clusterName=$EKS_CLUSTER_NAME \
  --set serviceAccount.create=false \
  --set serviceAccount.name=aws-load-balancer-controller 

###############
# setup Argo CD with NLB
mkdir argocd-install-kustomize
curl https://raw.githubusercontent.com/argoproj/argo-cd/stable/manifests/install.yaml > ./argocd-install-kustomize/argocd-install.yaml

cat << EOF > ./argocd-install-kustomize/kustomization.yaml
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization
metadata:
  name: argocd-server-patch

resources:
- argocd-install.yaml

patches:
- path: svc-argocd-server-patch.yaml
EOF

cat << EOF > ./argocd-install-kustomize/svc-argocd-server-patch.yaml
apiVersion: v1
kind: Service
metadata:
  name: argocd-server
  annotations: # https://docs.aws.amazon.com/eks/latest/userguide/network-load-balancing.html#network-load-balancer
    service.beta.kubernetes.io/aws-load-balancer-nlb-target-type: ip
    service.beta.kubernetes.io/aws-load-balancer-scheme: internal
    service.beta.kubernetes.io/aws-load-balancer-type: external
spec:
  type: LoadBalancer
EOF

kubectl create namespace argocd
kubectl apply -n argocd -k ./argocd-install-kustomize


# Setup Karpentar

## TODO: Change Karpentar settings
EKS_CLUSTER_NAME=xxxx
KARPENTER_QUEUE_NAME=xxxx
KARPENTER_VERSION=0.37.0
KARPENTER_NODE_AMI_FAMILY=Bottlerocket
KARPENTER_NODE_ROLE=KarpenterNodeRole-xxxx
KARPENTER_NODE_SG_NAME=eks-cluster-sg-xxx # set existing sg

## Logout of helm registry to perform an unauthenticated pull against the public ECR
helm registry logout public.ecr.aws
helm upgrade --install karpenter oci://public.ecr.aws/karpenter/karpenter --version "${KARPENTER_VERSION}" --namespace "kube-system" --create-namespace \
  --set "settings.clusterName=defaultvpc-eksctl" \
  --set "settings.interruptionQueue=${KARPENTER_QUEUE_NAME}" \
  --set controller.resources.requests.cpu=1 \
  --set controller.resources.requests.memory=1Gi \
  --set controller.resources.limits.cpu=1 \
  --set controller.resources.limits.memory=1Gi \
  --wait

## Create NodePool and EC2NodeClass
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
          values: ["amd64", "arm64"]
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
          values: ["large"]
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