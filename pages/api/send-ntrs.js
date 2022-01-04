import Web3 from "web3";
import ntrABI from "../../config/abis/ntr.json";

const web3 = new Web3(
  process.env.NODE_ENV !== "production"
    ? "https://data-seed-prebsc-1-s1.binance.org:8545/"
    : "https://bsc-dataseed.binance.org/"
);

const adminAccountAddress = process.env.NEXT_PUBLIC_ADMIN_ACCOUNT;
const ntrContractAddress = process.env.NEXT_PUBLIC_NTR_CONTRACT_ADDRESS;
const ntrContract = new web3.eth.Contract(ntrABI, ntrContractAddress);
const chainId = process.env.NODE_ENV !== "production" ? 97 : 56;

export default async function handler(req, res) {
  if (req.method.toUpperCase() === "POST") {
    if (
      !req.body.user_address?.trim() ||
      !req.body.ntrs ||
      isNaN(req.body.ntrs)
    ) {
      return res
        .status(400)
        .json({ message: "Invalid fields in request body!" });
    }

    if (!web3.utils.isAddress(req.body.user_address)) {
      return res.status(400).json({ message: "Invalid account address!" });
    }

    req.body.ntrs = Number(req.body.ntrs);

    try {
      await sendNTRs(req, res, req.body.ntrs, req.body.user_address);
    } catch (error) {
      console.error(error);
      return res.status(400).json({ message: error.message });
    }
  } else {
    res
      .status(404)
      .json({ message: `${req.method}: ${req.url} does not exist!` });
  }
}

async function sendNTRs(req, res, amount, to) {
  // Check if the admin wallet has enough NTRs
  try {
    const ntrBalance = web3.utils.fromWei(
      `${await ntrContract.methods.balanceOf(adminAccountAddress).call()}`,
      "ether"
    );
    if (ntrBalance < amount) {
      return res.status(500).json({ message: "Insufficient NTR balance!" });
    }
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Something went wrong!" });
  }

  let gasLimit = null;

  try {
    gasLimit = await web3.eth.estimateGas({
      from: adminAccountAddress,
      to: ntrContractAddress,
      chainId,
      data: ntrContract.methods
        .transfer(to, web3.utils.toWei(`${amount}`, "ether"))
        .encodeABI(),
      common: {
        customChain: {
          networkId: chainId,
          chainId,
        },
      },
    });
  } catch (error) {
    console.dir(error);
    return res.status(500).json({ message: "Something went wrong!" });
  }

  const nonce = await web3.eth.getTransactionCount(adminAccountAddress);
  const rawTransaction = {
    nonce: web3.utils.toHex(nonce),
    from: adminAccountAddress,
    to: ntrContractAddress,
    chainId,
    data: ntrContract.methods
      .transfer(to, web3.utils.toWei(`${amount}`, "ether"))
      .encodeABI(),
    gas: web3.utils.toHex(gasLimit),
    chainId,
    common: {
      customChain: {
        networkId: chainId,
        chainId,
      },
    },
  };

  const signedTrx = (
    await web3.eth.accounts.signTransaction(
      rawTransaction,
      process.env.ADMIN_ACCOUNT_PRIVATE_KEY
    )
  ).rawTransaction;

  try {
    const trx = await web3.eth.sendSignedTransaction(signedTrx);
    res.status(200).json({
      message: "Successfully sent NTRs!",
      trx,
    });
  } catch (error) {
    console.dir(error);
    return res.status(500).json({ message: "Something went wrong!" });
  }
}
