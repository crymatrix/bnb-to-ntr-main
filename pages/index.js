import styles from "../styles/Home.module.css";
import Web3 from "web3";
import { useEffect, useRef, useState } from "react";
import axios from "axios";
import ntrABI from "../config/abis/ntr.json";

const NTR_CMC_ID = 11921;
const USDT_CMC_ID = 2781;
const BNB_CMC_ID = 1839;
const contractAddress = process.env.NEXT_PUBLIC_NTR_CONTRACT_ADDRESS;
const adminAccountAddress = process.env.NEXT_PUBLIC_ADMIN_ACCOUNT;

export default function Home() {
  const [web3, setWeb3] = useState(null);
  const [ntrContract, setNtrContract] = useState(null);
  const [account, setAccount] = useState(null);
  const [chainId, setChainId] = useState(null);
  const errRef = useRef(null);
  const [prices, setPrices] = useState({
    in_usd: 0,
    in_bnb: 0,
    in_ntr: 0,
  });

  useEffect(() => {
    (async () => {
      if (window.ethereum) {
        setWeb3(new Web3(window.ethereum));
      }
    })();
  }, []);

  useEffect(() => {
    if (web3) {
      setNtrContract(new web3.eth.Contract(ntrABI, contractAddress));
    }
  }, [web3]);

  async function change(value, from) {
    try {
      let url = "";
      if (from === "bnb_to_ntr") {
        url = `https://api.coinmarketcap.com/data-api/v3/tools/price-conversion?amount=${value}&id=${BNB_CMC_ID}&convert_id=${USDT_CMC_ID},${NTR_CMC_ID}`;
      } else {
        url = `https://api.coinmarketcap.com/data-api/v3/tools/price-conversion?amount=${value}&id=${NTR_CMC_ID}&convert_id=${USDT_CMC_ID},${BNB_CMC_ID}`;
      }
      const res = await axios.get(url);
      const data = {
        in_usd: isNaN(Number(res?.data?.data?.quote[0]?.price))
          ? 0
          : Number(res?.data?.data?.quote[0]?.price),
      };

      if (from === "bnb_to_ntr") {
        data.in_bnb = value;
        data.in_ntr = isNaN(Number(res?.data?.data?.quote[1]?.price))
          ? 0
          : Number(res?.data?.data?.quote[1]?.price);
      } else {
        data.in_ntr = value;
        data.in_bnb = isNaN(Number(res?.data?.data?.quote[1]?.price))
          ? 0
          : Number(res?.data?.data?.quote[1]?.price);
      }
      const oneNTRInBNB = isNaN(Number(data.in_bnb) / Number(data.in_ntr))
        ? 0
        : Number(data.in_bnb) / Number(data.in_ntr);
      const plus5Percent = oneNTRInBNB + (5 / 100) * oneNTRInBNB;

      if (from === "bnb_to_ntr") {
        data.in_ntr = isNaN(Number(data.in_bnb) / plus5Percent)
          ? 0
          : Number(data.in_bnb) / plus5Percent;
      } else {
        data.in_bnb = isNaN(data.in_ntr * plus5Percent)
          ? 0
          : data.in_ntr * plus5Percent;
      }
      setPrices((prev) => {
        return {
          ...prev,
          ...data,
          from,
        };
      });
    } catch (error) {
      console.log(error);
    }
  }

  async function connectMetaMask(e) {
    e.target.disabled = true;
    e.target.innerText = "Connecting...";

    if (!web3) {
      errRef.current.innerText = "MetaMask is not installed!";
      e.target.disabled = false;
      e.target.innerText = "Connect Wallet";
      return;
    }
    let account = null;
    try {
      account = (await web3.eth.requestAccounts())[0];
    } catch (error) {
      console.dir(error);
      e.target.disabled = false;
      e.target.innerText = "Connect Wallet";
      return;
    }
    setAccount(account);

    let chainId = null;
    try {
      chainId = await web3.eth.getChainId();
    } catch (error) {
      console.dir(error);
      e.target.disabled = false;
      e.target.innerText = "Connect Wallet";
      return;
    }
    setChainId(chainId);

    if (chainId !== 97 && chainId !== 56) {
      errRef.current.innerText = "Please connect to Binance Smart Chain!";
      e.target.disabled = false;
      e.target.innerText = "Connect Wallet";
      return;
    }

    e.target.disabled = true;
    e.target.innerText = `MetaMask Connected`;
    errRef.current.innerText = "";
  }

  async function buyNTRs(e) {
    e.target.disabled = true;
    e.target.innerText = "Buying...";

    if (!account) {
      errRef.current.innerText = "Please connect your wallet!";
      e.target.disabled = false;
      e.target.innerText = "Buy NTRs";
      return;
    }

    if (chainId !== 97 && chainId !== 56) {
      errRef.current.innerText = "Please connect to Binance Smart Chain!";
      e.target.disabled = false;
      e.target.innerText = "Buy NTRs";
      return;
    }

    if (!prices.in_ntr || !prices.in_bnb) {
      errRef.current.innerText = "BNB and NTR amounts are required!";
      e.target.disabled = false;
      e.target.innerText = "Buy NTRs";
      return;
    }

    // Check if the admin wallet has enough NTRs
    try {
      const ntrBalance = web3.utils.fromWei(
        `${await ntrContract.methods.balanceOf(adminAccountAddress).call()}`,
        "ether"
      );
      if (ntrBalance < prices.in_ntr) {
        errRef.current.innerText = "Admin account doesn't have enough NTRs";
        e.target.disabled = false;
        e.target.innerText = "Buy NTRs";
        return;
      }
    } catch (error) {
      console.dir(error);
      errRef.current.innerText = error.message;
      e.target.disabled = false;
      e.target.innerText = "Buy NTRs";
      return;
    }

    const balance = web3.utils.fromWei(
      `${await web3.eth.getBalance(account)}`,
      "ether"
    );

    if (balance < prices.in_bnb) {
      errRef.current.innerText = "Insufficient BNB Balance!";
      e.target.disabled = false;
      e.target.innerText = "Buy NTRs";
      return;
    }

    let gasLimit = null;

    try {
      gasLimit = await web3.eth.estimateGas({
        from: account,
        to: process.env.NEXT_PUBLIC_ADMIN_ACCOUNT,
        value: web3.utils.toHex(web3.utils.toWei(`${prices.in_bnb}`, "ether")),
        chainId,
      });
    } catch (error) {
      console.dir(error);
      errRef.current.innerText = "Something went wrong with MetaMask!";
      e.target.disabled = false;
      e.target.innerText = "Buy NTRs";
      return;
    }

    const nonce = await web3.eth.getTransactionCount(account);
    const rawTransaction = {
      nonce: web3.utils.toHex(nonce),
      from: account,
      to: process.env.NEXT_PUBLIC_ADMIN_ACCOUNT,
      value: web3.utils.toHex(web3.utils.toWei(`${prices.in_bnb}`, "ether")),
      gas: web3.utils.toHex(gasLimit),
      chainId: web3.utils.toHex(chainId),
    };

    let trx = null;
    try {
      trx = await web3.eth.sendTransaction(rawTransaction);
    } catch (error) {
      console.dir(error);
      errRef.current.innerText = "MetaMask Transaction Failed!";
      e.target.disabled = false;
      e.target.innerText = "Buy NTRs";
      return;
    }

    // Send NTRs to user address from backend
    try {
      const res = await axios.post("/api/send-ntrs", {
        user_address: account,
        ntrs: prices.in_ntr,
      });
      console.log(res.data);
    } catch (error) {
      console.dir(error);
      errRef.current.innerText = error.response?.data?.message || error.message;
      e.target.disabled = false;
      e.target.innerText = "Buy NTRs";
      return;
    }
    errRef.current.innerText = "";
    e.target.disabled = false;
    e.target.innerText = "Buy NTRs";
  }

  if (!web3) {
    return <h1>Please Use a Browser which has MetaMask</h1>;
  }

  return (
    <div className={styles.container}>
      <button onClick={connectMetaMask}>Connect Wallet</button>
      <div>{account}</div>
      <div>
        Network:{" "}
        {chainId === 56
          ? "BSC Mainnet"
          : chainId === 97
          ? "BSC Testnet"
          : "Other"}
      </div>
      <div>
        <div>
          <label>BNB</label>
        </div>
        <input
          type={"number"}
          placeholder="Enter value in BNB"
          min={0}
          value={prices.in_bnb}
          onChange={(e) => {
            change(e.target.value, "bnb_to_ntr");
          }}
        />
      </div>

      <div>
        <div>
          <label>NTR</label>
        </div>
        <input
          type={"number"}
          placeholder="Enter value in NTR"
          min={0}
          value={prices.in_ntr}
          onChange={(e) => {
            change(e.target.value, "ntr_to_bnb");
          }}
        />
      </div>

      <div>
        <button onClick={buyNTRs}>Buy NTRs</button>
      </div>
      <div ref={errRef} style={{ color: "red" }}></div>
    </div>
  );
}
