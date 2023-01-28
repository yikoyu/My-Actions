#!/usr/bin/env python
# -*- encoding: utf-8 -*-
"""
@File    :   lint.py
@Time    :   2023-01-22 14:30:58
@Author  :   yikoyu
@Version :   1.0
@Desc    :   按照规范检查代码
"""

import subprocess
import sys
from contextlib import contextmanager
from typing import Generator


class Lint(object):
    DIRS = " ".join(("app", "tests", "scripts"))

    def __init__(self) -> None:
        self.command = {
            "autoflake": (
                "--recursive",
                "--remove-all-unused-imports",
                "--remove-unused-variables",
                self.DIRS,
            ),
            "isort": ("--check-only", self.DIRS),
            "black": ("--check", self.DIRS, "--diff"),
            "mypy": (self.DIRS,),
            "flake8": (self.DIRS,),
        }

        self.run()
        self.success_exit()

    @contextmanager
    def cmd_output(
        self, cmd: str, key: str
    ) -> Generator[subprocess.CompletedProcess[bytes], None, None]:

        try:
            result = subprocess.run(
                cmd,
                stdout=subprocess.PIPE,
                stdin=subprocess.PIPE,
                check=True,
                shell=True,
            )

            yield result

        except subprocess.CalledProcessError as e:
            print(f"[{key}] Error lint abort:")
            print(e.stdout.decode("utf-8"))
            print(f"----------- {key} End -----------")
            sys.exit(1)

        except Exception as e:
            print(f"[{key}] Unknown error lint abort:")
            print(e)
            print(f"----------- {key} End -----------")
            sys.exit(1)

    def run(self) -> None:
        for i in self.command.items():
            key, args = i
            cmd = f"{key} {' '.join(args)}"
            print(f"------------ {key} start run... ----------")
            print(f"[{key}] {cmd}")

            with self.cmd_output(cmd, key) as result:
                print(result.stdout.decode("utf-8"))

            print(f"[{key}] end")
            print(f"----------- {key}  End -----------\n\n")

    def success_exit(self) -> None:
        print(
            (
                "======================\n"
                "Your project is good!\n"
                "======================"
            )
        )


def main() -> None:
    Lint()


if __name__ == "__main__":
    main()
