# -*- encoding: utf-8 -*-
"""
@File    :   format.py
@Time    :   2023-01-22 12:17:16
@Author  :   yikoyu
@Version :   1.0
@Desc    :   格式化代码 black + isort + autoflake
"""

import subprocess
import sys
from contextlib import contextmanager
from typing import Generator


def first_word(text: str) -> str:
    """Get the first word"""
    return text.strip().split(" ")[0]


class Format(object):
    DIRS = " ".join(("app", "tests", "scripts"))

    def __init__(self) -> None:
        self.command = [
            f"autoflake --recursive --remove-all-unused-imports\
            --remove-unused-variables --in-place {self.DIRS}",
            f"black {self.DIRS}",
            f"isort {self.DIRS}",
        ]

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
                shell=True,
                check=True,
            )

            yield result

        except subprocess.CalledProcessError as e:
            print(f"[{key}] Error format abort")
            print(e.stdout.decode("utf-8"))
            print(f"----------- {key} End -----------")
            sys.exit(1)

        except Exception as e:
            print(e)
            print(f"----------- {key} End -----------")
            sys.exit(1)

    def run(self) -> None:
        for cmd in self.command:
            key = first_word(cmd)
            print(f"----------- {key} start run... -----------")
            print(f"[{key}] {cmd}")

            with self.cmd_output(cmd, key) as result:
                print(result.stdout.decode("utf-8"))

            print(f"----------- {key} End -----------\n\n")

    def success_exit(self) -> None:
        print(
            (
                "==========================\n"
                "Your project format over!\n"
                "=========================="
            )
        )


def main() -> None:
    Format()


if __name__ == "__main__":
    main()
