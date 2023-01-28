#!/usr/bin/env python
# -*- encoding: utf-8 -*-
"""
@File    :   bika.py
@Time    :   2023-01-28 15:53:56
@Author  :   yikoyu
@Version :   1.0
@Desc    :   自动打哔咔
"""


import hashlib
import hmac
import logging
import os
import time
import uuid
from typing import Optional

import httpx

logging.basicConfig(
    level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)

ENV = os.environ


class BiKa(object):
    BASE_URL = "https://picaapi.picacomic.com/"
    POST = "POST"

    API_PATH = {"sign_in": "auth/sign-in", "punch_in": "users/punch-in"}

    API_KEY = "C69BAF41DA5ABD1FFEDC6D2FEA56B"
    API_SECRET = "~d}$Q7$eIni=V)9\\RK/P.RM4;9[7|@/CA}b~OW!3?EV`:<>M7pddUBL5n|0/*Cn"

    STATIC_HEADERS = {
        "api-key": API_KEY,
        "accept": "application/vnd.picacomic.com.v1+json",
        "app-channel": "2",
        "app-version": "2.2.1.3.3.4",
        "app-uuid": "defaultUuid",
        "image-quality": "original",
        "app-platform": "android",
        "app-build-version": "45",
        "User-Agent": "okhttp/3.8.1",
    }

    def _encode_signature(self, raw: str):
        raw = raw.lower()
        h = hmac.new(self.API_SECRET.encode("utf-8"), digestmod=hashlib.sha256)
        h.update(raw.encode("utf-8"))
        return h.hexdigest()

    def _send_request(
        self,
        _url: str,
        method: str,
        body: Optional[dict[str, str]] = None,
        token: Optional[str] = None,
    ):
        current_time = str(int(time.time()))
        nonce = str(uuid.uuid4()).replace("-", "")

        _raw = _url + current_time + nonce + method + self.API_KEY
        signature = self._encode_signature(_raw)

        headers = {
            **self.STATIC_HEADERS,
            "time": current_time,
            "nonce": nonce,
            "signature": signature,
        }

        if method.lower() in ["post", "put"]:
            headers["Content-Type"] = "application/json; charset=UTF-8"

        if token is not None:
            headers["authorization"] = token

        url = self.BASE_URL + _url
        data = httpx.request(method=method, url=url, headers=headers, json=body).json()

        if data["code"] != 200:
            raise httpx.RequestError(data["message"])

        return data

    def sign_in(self, email: str, password: str) -> str:
        body = {"email": email, "password": password}
        res = self._send_request(self.API_PATH["sign_in"], self.POST, body)
        return res["data"]["token"]

    def punch_in(self, token: str):
        res = self._send_request(self.API_PATH["punch_in"], self.POST, token=token)
        return res["data"]["res"]


if __name__ == "__main__":
    bika = BiKa()

    if ENV["BIKA_USER"] == "" or ENV["BIKA_PASS"] == "":
        logger.error("未填写哔咔账号密码 取消运行")
        raise ValueError("未填写哔咔账号密码 取消运行")

    current_token = bika.sign_in(ENV["BIKA_USER"], ENV["BIKA_PASS"])
    result = bika.punch_in(current_token)

    if result["status"] == "ok":
        logger.info("打卡成功, 最后一次打卡: %s", result["punchInLastDay"])
    else:
        logger.warning("重复签到 - Already punch-in")
