import "./loadEnv.js";
import { Network } from "./src/common/network.js";

const network = new Network();

function addRecord() {
  return network.addRecord("arvan", "erfan27.me", {
    type: "A",
    content: "2.2.2.2",
    isProxy: true,
    name: "im-test",
    secure: false,
  });
}

function rmRecord() {
  return network.rmRecord("arvan", "erfan27.me", {
    type: "A",
    content: "2.2.2.2",
    name: "im-test",
  });
}

async function dupAdd() {
  await addRecord();
  await addRecord();
}

async function connectInstance() {
  await network.connectInstance("arvan", {
    defaultDomain: Network.getDefaultDomain({
      name: "my-test",
      region: "iran",
    }),
    content: "3.3.3.3",
    logger: console,
    port: 80,
    domains: [{ content: "mydomaintestim12.com" }],
  });
}

async function changeDomains() {
  await network.changeCustomDomains("arvan", {
    port: 80,
    content: "4.4.4.4",
    logger: console,
    primary_domain: "im-test.erfan27.me",
    domains_add: ["mynewdomainfrommaster.me"],
    domains_rm: ["mydomaintestim12.com"],
  });
}

async function main() {
  console.log("start test");

  try {
    await changeDomains();
    console.log("success change domains");
  } catch (err) {
    console.log("error from change domains", err);
  }
  //   try {
  //     await connectInstance();
  //     console.log("success connect network");
  //   } catch (err) {
  //     console.log("error from network connect", err);
  //   }
  //   try {
  //     await addRecord();
  //     console.log("success add");
  //   } catch (err) {
  //     console.log("error from add", err);
  //   }
  //   try {
  //     await rmRecord();
  //     console.log("success rm");
  //   } catch (err) {
  //     console.log("error from rm", err);
  //   }
  //   try {
  //     await dupAdd();
  //     console.log("success dupAdd");
  //   } catch (err) {
  //     console.log("error from dupAdd", err);
  //   }
}

main();
