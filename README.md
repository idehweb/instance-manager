## Volumes
- bind host ssh private key in `/root/.ssh/host-private`
## Endpoints
- `/health`
  response must be `{status : ok}` with http code `200`

## Deployment
### Image Build
```sh
$ docker image build -t <TAG_NAME> . 
```
  