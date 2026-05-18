package kms

import (
	"context"
	"fmt"
)

// AWSKMSClient is intentionally not a stub: this build fails closed for the
// aws/aws_kms backend unless a deployment-specific build wires an AWS SDK
// client. That prevents production from silently accepting a backend that
// cannot wrap or unwrap data keys.
type AWSKMSClient struct{ keyARN string }

func NewAWSKMSClient(_ context.Context, _, keyARN, _ string) (*AWSKMSClient, error) {
	if keyARN == "" {
		return nil, ErrAWSKeyMissing
	}
	return nil, fmt.Errorf("cipher kms: aws backend unavailable in this build; configure a real AWS KMS client or use local only for dev/test")
}

func (c *AWSKMSClient) Wrap([]byte) ([]byte, error) {
	return nil, fmt.Errorf("cipher kms: aws backend unavailable in this build")
}
func (c *AWSKMSClient) Unwrap([]byte) ([]byte, error) {
	return nil, fmt.Errorf("cipher kms: aws backend unavailable in this build")
}
func (c *AWSKMSClient) Ref() string { return "aws:kms:" + c.keyARN }
