#!/usr/bin/env python3
"""Add the MobiBard-Compatible marker to an SF2 / SF3 / DLS file.

usage: python add_mobibard_marker.py input.dls output.dls [version]

The marker is a comment (ICMT) inside the file's RIFF INFO list:
    MobiBard-Compatible: 1
    MobiBard-Version: v1.0
Only the INFO list is rewritten; samples and presets are copied byte for byte.
"""
import struct
import sys


def chunks(data, start, end):
    pos = start
    while pos + 8 <= end:
        cid = data[pos:pos + 4]
        size = struct.unpack("<I", data[pos + 4:pos + 8])[0]
        yield cid, pos, size
        pos += 8 + size + (size & 1)


def make_chunk(cid, payload):
    out = cid + struct.pack("<I", len(payload)) + payload
    return out + (b"\0" if len(payload) & 1 else b"")


def main():
    if len(sys.argv) < 3:
        sys.exit(__doc__)
    src, dst = sys.argv[1], sys.argv[2]
    version = sys.argv[3] if len(sys.argv) > 3 else "v1.0"
    data = open(src, "rb").read()
    if data[:4] != b"RIFF" or data[8:12] not in (b"DLS ", b"sfbk"):
        sys.exit("Not an SF2/SF3/DLS (RIFF) file.")
    comment = (
        "MobiBard-Compatible: 1\r\nMobiBard-Version: %s\r\n"
        "MobiBard instrument bank." % version
    ).encode("utf-8") + b"\0"

    parts, done = [], False
    for cid, pos, size in chunks(data, 12, len(data)):
        raw = data[pos:pos + 8 + size + (size & 1)]
        if cid == b"LIST" and data[pos + 8:pos + 12] == b"INFO":
            items, has = [], False
            for sid, spos, ssize in chunks(data, pos + 12, pos + 8 + size):
                if sid == b"ICMT":
                    items.append(make_chunk(b"ICMT", comment))
                    has = True
                else:
                    items.append(data[spos:spos + 8 + ssize + (ssize & 1)])
            if not has:
                items.append(make_chunk(b"ICMT", comment))
            raw = make_chunk(b"LIST", b"INFO" + b"".join(items))
            done = True
        parts.append(raw)
    if not done:  # no INFO list: add one right after the RIFF header
        parts.insert(0, make_chunk(b"LIST", b"INFO" + make_chunk(b"ICMT", comment)))
    body = data[8:12] + b"".join(parts)
    open(dst, "wb").write(b"RIFF" + struct.pack("<I", len(body)) + body)
    print("OK:", dst)


if __name__ == "__main__":
    main()
