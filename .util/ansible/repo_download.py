#!/usr/bin/python -tt

# It's possible that this list will change in the future
environments = ["na","we","ea","cdsdev", "svl","enfield"]

attempted = []

import hashlib
import shutil
import uuid
import os


# Calculate the MD5 sum of a file. This is not
# a security measure -- files must be downloaded
# over tls. This is used to check if file already
# has been downloaded
def md5(fname):
    md5sum = hashlib.md5()
    with open(fname, "rb") as f:
        for chunk in iter(lambda: f.read(4096), b""):
            md5sum.update(chunk)
    return md5sum.hexdigest()

# Return a filename if path contains one entry
# Otherwise return none. Wget will only download
# one file to the new directory. None or multiple
# files should be treated as a critical error
def getSingleFile(path):
    listing = os.listdir(path)
    # Only one file should exist in new directory
    if len(listing) != 1:
        return None
    # New file must not be a directory
    if not os.path.isfile(os.path.join(path, listing[0])):
        return None
    return listing[0]

# Code forom main taken with modifications from core module
def execute_download(module):
    domain = module.params.get('repo_domain')
    port = module.params.get('repo_port')
    dest = module.params.get('dest')
    region = module.params.get('region')
    # Create a randomized string to use as transaction ID
    txId = str(uuid.uuid4()).replace('-','')
    tmpPath = os.path.join(module.params.get('tmp_dir'), txId)
    tmpPathErr = 'Could not create transaction directory {0}'.format(tmpPath)
    # Create temporary path. File is saved to a directory to preserve
    # the disposition filename. Fail if dir already exists
    if os.path.exists(tmpPath):
        module.fail_json(msg=tmpPathErr)
        return (msg, False, True)
    os.makedirs(tmpPath)
    if not os.path.exists(tmpPath):
        module.fail_json(msg=tmpPathErr)
        return (msg, False, True)
    # join parts to form url
    # e.g. "https://lon02.cumulusrepo.com/assets/nginx/1.2.3/"
    url = 'https://' + '/'.join([
        region + '.' + domain + ':' + port,
        'assets',
        module.params.get('asset'),
        module.params.get('version')
    ]) + '/'
    apikey = 'X-API-KEY: {0}'.format(module.params.get('key'))
    # Status codes
    wgetStatusCode=0
    curlStatusCode=0
    # Perform the actual download with wget
    optionalFilename = module.params.get('filename')
    if optionalFilename:
        fullWgetPath = os.path.join(tmpPath, optionalFilename)
        wgetCmd = ['wget', '--header', apikey, '-O', fullWgetPath, url]
    else:
        wgetCmd= ['wget', '--header', apikey, '--content-disposition', url, '-P', tmpPath]
    wgetStatusCode = subprocess.call(wgetCmd)
    if wgetStatusCode != 0:
        if optionalFilename:
            curlCmd = ['curl', '-H', apikey, '-o', optionalFilename, url]
        else:
            curlCmd = ['curl', '-H', apikey, '-O', '-J', url]
        curlStatusCode = subprocess.call(curlCmd, cwd=tmpPath)
    # check for success
    if curlStatusCode != 0 and wgetStatusCode != 0:
        os.rmdir(tmpPath);
        module.fail_json(
            msg='Download failed wget:{0}, curl:{1}'.format(wgetStatusCode, curlStatusCode))
        return (msg, False, True)
    # get filename
    filename = getSingleFile(tmpPath)
    if filename == None:
        module.fail_json(msg='There was a problem downloading file')
        return (msg, False, True)
    # full new file path
    tmpFilePath = os.path.join(tmpPath, filename)
    tmpFileSum = md5(tmpFilePath)
    # targetFileSum is used to decide if the system state has changed
    targetFileSum = None
    if not os.path.exists(dest):
        os.makedirs(dest)
    if os.path.isfile(dest):
        targetFileSum = md5(dest)
    elif os.path.isdir(dest):
        target = os.path.join(dest, filename)
        if os.path.isfile(target):
            targetFileSum = md5(target)
        # change destination directory to filename
        dest = target
    # If the checksums match, nothing else needs to be done. Clean up and
    # return unchanged. If they do not match, check if the directory needs
    # to be created then move the file.
    if tmpFileSum == targetFileSum:
        # Remove temporary file
        shutil.rmtree(tmpPath)
        #return ('ok lol', False, False)
        msg = 'File already exists with sum md5:{0}'.format(tmpFileSum)
        return (msg, False, False)
    else:
        dirname = os.path.dirname(dest)
        if not os.path.exists(dirname):
            os.makedirs(dirname)
        os.rename(tmpFilePath, dest)
        shutil.rmtree(tmpPath)
        msg = 'File replaced/created with new sum md5:{0}'.format(tmpFileSum)
        return (msg, True, False)

def main():
    module = AnsibleModule(
        # not checking because of daisy chain to file module
        argument_spec=dict(
            asset=dict(required=True),
            version=dict(required=True),
            key = dict(required=True),
            region=dict(default=environments[0], choices=environments),
            dest = dict(default='./'),
            sha256sum = dict(default=''),
            checksum = dict(default=''),
            filename = dict(default=''),
            timeout = dict(required=False, type='int', default=10),
            repo_domain=dict(default='cumulusrepo.com'),
            repo_port=dict(default='443'),
            tmp_dir = dict(required=False, default='/tmp/')
        )
    )
    #return module.exit_json(changed=True, failed=False)

    msg, changed, failed = execute_download(module)
    return module.exit_json(msg=msg, changed=changed, failed=failed)

from ansible.module_utils.basic import *
import time
import subprocess


if __name__ == '__main__':
    main()
