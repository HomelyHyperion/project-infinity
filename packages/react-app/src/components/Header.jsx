import { PageHeader } from "antd";
import React from "react";

// displays a page header

export default function Header() {
  return (
    <a href="/">
      <PageHeader
        title="👽 Infinity-721"
        subTitle="An infinity portal of NFTs, mint and chain your NFTs"
        style={{ cursor: "pointer" }}
      />
    </a>
  );
}
