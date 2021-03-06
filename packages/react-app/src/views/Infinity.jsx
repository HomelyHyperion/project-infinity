import React, { useState, useEffect } from 'react';
import ReactTextFormat from 'react-text-format';
import { PlusOutlined, CloseCircleOutlined, UpCircleFilled } from '@ant-design/icons';
import { Upload, Input, Button, Spin } from 'antd';
import { NFTStorage } from 'nft.storage';
import { useHistory, useParams, Link } from 'react-router-dom';

import { NFT_STORAGE_KEY } from '../constants';
import { Transactor } from '../helpers';

// rewrite ipfs:// uris to dweb.link gateway URLs
function makeGatewayURL(ipfsURI) {
  return ipfsURI.replace(/^ipfs:\/\//, "https://dweb.link/ipfs/");
}

async function fetchIPFSJSON(ipfsURI) {
  const url = makeGatewayURL(ipfsURI);
  const resp = await fetch(url);
  return resp.json();
}

async function getNFT({contract, tokenId}) {
  if(!tokenId) {
    return {id: 0, description: "ETHGlobal 2021", image: "/ethglobal.jpg", name: "Genesis"};
  }

  const metadataURI = await contract.tokenURI(tokenId);
  console.log('metadata uri: ', metadataURI);
  
  const metadata = await fetchIPFSJSON(metadataURI);
  console.log('metadata: ', metadata)

  if (metadata.image) {
    metadata.image = makeGatewayURL(metadata.image);
  }
  return {id: Number(tokenId), ...metadata};
}

async function mintNFT({contract, ownerAddress, provider, gasPrice, setStatus, image, name, description, blockNumber, parentTokenId}) {

  // First we use the nft.storage client library to add the image and metadata to IPFS / Filecoin
  const client = new NFTStorage({ token: NFT_STORAGE_KEY });
  setStatus("Uploading to nft.storage...");
  const metadata = await client.store({
    name,
    description,
    image,
    parentTokenId,
    blockNumber
  });
  setStatus(`Upload complete! Minting token with metadata URI: ${metadata.url}`);

  // the returned metadata.url has the IPFS URI we want to add.
  // our smart contract already prefixes URIs with "ipfs://", so we remove it before calling the `mintToken` function
  const metadataURI = metadata.url.replace(/^ipfs:\/\//, "");

  // scaffold-eth's Transactor helper gives us a nice UI popup when a transaction is sent
  const transactor = Transactor(provider, gasPrice);
  const tx = await transactor(contract.mintTokenWithParent(ownerAddress, metadataURI, parentTokenId));

  setStatus("Blockchain transaction sent, waiting confirmation...");

  // Wait for the transaction to be confirmed, then get the token ID out of the emitted Transfer event.
  const receipt = await tx.wait();
  let tokenId = null;
  for (const event of receipt.events) {
    if (event.event !== 'Transfer') {
        continue
    }
    tokenId = event.args.tokenId.toString();
    break;
  }
  setStatus(`Minted token #${tokenId}`);
  return tokenId;
}

const Infinity = ({
  customContract,
  account,
  gasPrice,
  signer,
  provider,
  name,
  price,
  blockExplorer,
  tx,
  writeContracts,
  readContracts
}) => {
  const [blockNum, setBlockNum] = useState(0);
  const [showMinter, setShowMinter] = useState(false);
  const [previewURL, setPreviewURL] = useState(null);
  const [file, setFile] = useState(null);
  const [nftName, setName] = useState("");
  const [description, setDescription] = useState("");
  const [minting, setMinting] = useState(false);
  const [tokenId, setTokenId] = useState(null);
  const [status, setStatus] = useState("");
  const [parentItem, setParentItem] = useState({id: 0, description: "ETHGlobal 2021", image: "/ethglobal.jpg", name: "Genesis"});
  const [nftItems, setNftItems] = useState([]);
  const [currentItem, setCurrentItem] = useState(null);
  const [isFade, setIsFade] = useState(false);
  const items = [];
  const history = useHistory();
  const { id } = useParams();

  useEffect(async() => {
    // history.listen(location => {
    //   console.log(history.action);
    // });
    if(readContracts) {
      const parentItem = await getNFT({ contract: readContracts.NFTMinter, tokenId: id || 0 });
      const childTokenIds = await getChildTokens(id || 0);
      const blockItems = await getItems(childTokenIds);
      setParentItem(parentItem);      
      setNftItems(blockItems);
      setShowMinter(false);
      setCurrentItem(null);
    }
  }, [readContracts, id]);

  async function getChildTokens(parentTokenId) {
    const childTokenIds = await readContracts.NFTMinter.childTokenIds(parentTokenId);
    return childTokenIds;
  }

  async function getItems(childTokenIds) {
    for (let i = 0; i < childTokenIds.length; i++) {
      const item = await getNFT({ contract: readContracts.NFTMinter, tokenId: childTokenIds[i] });
      items.push(item);
    }
    return items;
  }

  const handleItemClick = async(index, nftItem) => {
    if(currentItem !== undefined && currentItem === nftItem) {
      setParentItem(nftItem);
      const childTokenIds = await getChildTokens(nftItem.id);
      const blockItems = await getItems(childTokenIds);
      setNftItems(blockItems);
      setCurrentItem(null);
      setBlockNum(0);
      setShowMinter(false);
      history.push(`/infinity/${nftItem.id}`)
    } else {
      setCurrentItem(nftItem);
      setBlockNum(index + 1);
      setShowMinter(true);
      setIsFade(true);
      setTimeout(() => {
        setIsFade(false);
      }, 300)
    }
  }

  const beforeUpload = (file, fileList) => {
    console.log(file, fileList);
    setFile(file);
    setPreviewURL(URL.createObjectURL(file));
    return false;
  }

  const mint = async() => {
    if(file === null) return false;
    startMinting(writeContracts.NFTMinter);
  }

  const startMinting = (contract) => {
    console.log(`minting nft with name ${nftName}`);
    setMinting(true);
    signer.getAddress().then(ownerAddress => {
      mintNFT({ 
        contract, 
        provider, 
        ownerAddress, 
        gasPrice, 
        setStatus,
        name: nftName, 
        image: file, 
        description,
        blockNumber: blockNum,
        parentTokenId: parentItem.id
      }).then(async(newTokenId) => {
        setMinting(false);
        setShowMinter(false);
        setFile(null);
        setPreviewURL(null);
        setName('');
        setDescription('');
        console.log('minting complete');
        setTokenId(newTokenId);
        const childTokenIds = await getChildTokens(parentItem.id);
        const blockItems = await getItems(childTokenIds);
        setNftItems(blockItems);
      })
    });
  }

  const uploadButton = (
    <div>
      <PlusOutlined />
      <div style={{ marginTop: 8 }}>
        Choose image
      </div>
    </div>
  );

  const uploadView = (
    <div>
      <b>Drop</b> an image file or <b>click below</b> to select.
      <Upload
        name="avatar"
        accept=".jpeg,.jpg,.png,.gif"
        listType="picture-card"
        className="avatar-uploader"
        showUploadList={false}
        action="https://www.mocky.io/v2/5cc8019d300000980a055e76"
        beforeUpload={beforeUpload}
      >
        {uploadButton}
      </Upload>
    </div>
  );

  const preview = previewURL ? 
    <div className="preview-image" style={{backgroundImage: `url(${previewURL})`}}>
      <Upload
        name="avatar"
        accept=".jpeg,.jpg,.png,.gif"
        listType="picture-card"
        className="avatar-uploader"
        showUploadList={false}
        action="https://www.mocky.io/v2/5cc8019d300000980a055e76"
        beforeUpload={beforeUpload}
      >
        {uploadButton}
      </Upload>
    </div> : <div/>

  const nameField = (
    <Input  disabled={minting} placeholder="Enter a name for your NFT" onChange={e => {
      setName(e.target.value);
    }}/>
  );

  const descriptionField = (
    <Input.TextArea  disabled={minting} placeholder="Enter a description" onChange={e => {
      setDescription(e.target.value);
    }}/>
  );

  return (
    <>
      <div className="frame">
        <div className="base-image" style={{backgroundImage: `url("${parentItem.image}")`}}></div>
        <div className="grid">
          {Array.from(Array(100).keys()).map(x => {
            const nftItemz = nftItems.filter(item => item.blockNumber === x + 1);
            if(nftItemz.length > 0) {
              const nftItem = nftItemz[0];
              return (
                <div
                  style={{backgroundImage: `url(${nftItem?.image})`}}
                  className={blockNum - 1 === x ? 'grid-item active' : 'grid-item filled'}
                  key={x} onClick={() => handleItemClick(x, nftItem)}></div>
              );
            } else {
              return (
                <div
                  style={{backgroundImage: `url('${parentItem.image}')`}}
                  className={blockNum - 1 === x ? 'grid-item active' : 'grid-item'}
                  key={x} onClick={() => handleItemClick(x)}></div>
              );
            }
          })}
        </div>
        {parentItem.id !== 0 && <Link to={`/infinity/${parentItem.parentTokenId !== 0 ? parentItem.parentTokenId : ''}`}><UpCircleFilled className="up-btn" onClick={() => history.goBack()} /></Link>}
      </div>
      <div className="navigator">
        <h3>{parentItem.name}</h3>
        <p><ReactTextFormat linkTarget="_blank">{parentItem.description}</ReactTextFormat></p>
      </div>
      {showMinter && <div className="minter">
        <CloseCircleOutlined className="close-btn" onClick={() => setShowMinter(false)} />
        <h3>Block #{blockNum}</h3>
        {currentItem && 
          <div className="current-item">
            <img src={currentItem.image} alt="" className={isFade ? 'fadeIn' : ''} />
            <br />
            <br />
            <h4>{currentItem.name}</h4>
            <p><ReactTextFormat linkTarget="_blank">{currentItem.description}</ReactTextFormat></p>
            <Button type="primary" onClick={() => handleItemClick(blockNum - 1, currentItem)}>Enter</Button>
          </div>
        }
        {!currentItem && 
          <>
            { file == null && uploadView }
            {preview}
            {nameField}
            {descriptionField}
            <Button disabled={minting} type="primary" onClick={mint}>Mint NFT</Button>
            <div style={{marginTop: '10px'}}>
              {minting && <Spin />}&nbsp;
              {status}
            </div>
          </>
        }
      </div>}
    </>
  );
}

export default Infinity;