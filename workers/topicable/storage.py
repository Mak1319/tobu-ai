"""MinIO / S3 storage helpers."""

from __future__ import annotations

import logging
from typing import Any
from urllib.parse import unquote_plus

import boto3
from botocore.client import Config
from botocore.exceptions import ClientError

from config import Settings

log = logging.getLogger("topicable.storage")


class ObjectStore:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        log.debug(
            "minio client endpoint=%s region=%s",
            settings.minio_endpoint,
            settings.minio_region,
        )
        self.s3 = boto3.client(
            "s3",
            endpoint_url=settings.minio_endpoint,
            aws_access_key_id=settings.minio_access_key,
            aws_secret_access_key=settings.minio_secret_key,
            region_name=settings.minio_region,
            config=Config(signature_version="s3v4"),
        )

    def download(self, key: str) -> tuple[bytes, dict[str, Any]]:
        key = unquote_plus(key)
        log.debug(
            "get_object Bucket=%s Key=%s",
            self.settings.uploaded_bucket,
            key,
        )
        try:
            response = self.s3.get_object(
                Bucket=self.settings.uploaded_bucket,
                Key=key,
            )
        except ClientError as exc:
            code = exc.response.get("Error", {}).get("Code")
            log.error(
                "download failed s3://%s/%s code=%s error=%s",
                self.settings.uploaded_bucket,
                key,
                code,
                exc,
            )
            raise

        body = response["Body"]
        try:
            data = body.read()
        finally:
            body.close()

        metadata = response.get("Metadata", {}) or {}
        content_type = response.get("ContentType")
        content_length = response.get("ContentLength")
        log.info(
            "downloaded s3://%s/%s bytes=%d content_type=%s content_length=%s",
            self.settings.uploaded_bucket,
            key,
            len(data),
            content_type,
            content_length,
        )
        log.debug("object metadata=%s", metadata)
        if content_type and "content-type" not in {k.lower() for k in metadata}:
            metadata = {**metadata, "content-type": content_type}
        return data, metadata

    def upload_markdown(self, key: str, markdown: str) -> str:
        body = markdown.encode("utf-8")
        log.debug(
            "put_object Bucket=%s Key=%s bytes=%d",
            self.settings.processed_bucket,
            key,
            len(body),
        )
        self.s3.put_object(
            Bucket=self.settings.processed_bucket,
            Key=key,
            Body=body,
            ContentType="text/markdown; charset=utf-8",
        )
        log.info(
            "uploaded s3://%s/%s bytes=%d",
            self.settings.processed_bucket,
            key,
            len(body),
        )
        return key

    def exists(self, key: str) -> bool:
        log.debug(
            "head_object Bucket=%s Key=%s",
            self.settings.processed_bucket,
            key,
        )
        try:
            self.s3.head_object(Bucket=self.settings.processed_bucket, Key=key)
            log.debug("exists=True key=%s", key)
            return True
        except ClientError as exc:
            code = str(exc.response.get("Error", {}).get("Code", ""))
            if code in {"404", "NoSuchKey", "NotFound"}:
                log.debug("exists=False key=%s", key)
                return False
            log.error("head_object failed key=%s code=%s error=%s", key, code, exc)
            raise
